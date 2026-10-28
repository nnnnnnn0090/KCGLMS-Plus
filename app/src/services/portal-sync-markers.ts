/**
 * マイリンク上の同期用レコード（マーカー）の読み書き。
 *
 * biko は 200 文字までなので、同期データは複数行に分けて保存する。
 * 各行の URL に「世代 ID と総行数」を入れ、同じ世代の行が全部そろったものだけを
 * 読む。書き込みが途中で混ざっても、壊れた組み合わせを読むことはない。
 *
 *   midashi: __KCGLMS::{index}                       （旧版もこの番号で読む）
 *   url:     https://home.kcg.ac.jp/portal/_kcglms/{index}/{rev}/{total}
 */

import {
  mergePortalSyncDocs,
  maxPortalSyncStampTime,
  type PortalSyncDoc,
} from '../domain/portal-sync-doc';
import { decodePortalSyncWire, type DecodedPortalSyncGeneration } from './portal-sync-wire';
import { nextPortalLinkNo, type PortalUserLink } from './user-html-link';

/** マイリンク UI に表示しない設定用マーカー */
export const PORTAL_SETTINGS_MARKER_PREFIX = '__KCGLMS::';

/** ポータル側の biko 上限（Profile 保存 API の検証） */
export const PORTAL_SETTINGS_BIKO_MAX = 200;

/** チャンク分割時の安全マージン */
export const PORTAL_SETTINGS_CHUNK_MAX = 190;

/** マイリンクの同期用レコードを増やしすぎないための上限 */
export const PORTAL_SETTINGS_MARKER_MAX = 64;

const PORTAL_SETTINGS_URL_PREFIX = 'https://home.kcg.ac.jp/portal/_kcglms/';

const MARKER_URL_RE = /^(\d+)(?:\/([a-z0-9]+)\/(\d+))?$/;

export function isPortalSettingsMarkerLink(link: Pick<PortalUserLink, 'midashi' | 'url'>): boolean {
  return (
    link.midashi.startsWith(PORTAL_SETTINGS_MARKER_PREFIX) ||
    link.url.startsWith(PORTAL_SETTINGS_URL_PREFIX)
  );
}

interface MarkerAddress {
  index: number;
  /** 旧形式の行は null */
  rev: string | null;
  total: number | null;
}

function markerAddress(link: PortalUserLink): MarkerAddress | null {
  if (link.url.startsWith(PORTAL_SETTINGS_URL_PREFIX)) {
    const match = MARKER_URL_RE.exec(link.url.slice(PORTAL_SETTINGS_URL_PREFIX.length));
    if (match) {
      return {
        index: Number(match[1]),
        rev: match[2] ?? null,
        total: match[3] ? Number(match[3]) : null,
      };
    }
  }
  const fromTitle = Number(link.midashi.slice(PORTAL_SETTINGS_MARKER_PREFIX.length));
  if (Number.isInteger(fromTitle) && fromTitle >= 0) {
    return { index: fromTitle, rev: null, total: null };
  }
  return null;
}

export function portalSyncMarkerTitle(index: number): string {
  return `${PORTAL_SETTINGS_MARKER_PREFIX}${index}`;
}

export function portalSyncMarkerUrl(index: number, rev: string, total: number): string {
  return `${PORTAL_SETTINGS_URL_PREFIX}${index}/${rev}/${total}`;
}

export function splitPortalSyncWire(wire: string): string[] {
  if (!wire) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < wire.length; i += PORTAL_SETTINGS_CHUNK_MAX) {
    chunks.push(wire.slice(i, i + PORTAL_SETTINGS_CHUNK_MAX));
  }
  return chunks;
}

export type PortalSyncRemoteRead =
  /** 同期データなし */
  | { kind: 'empty' }
  /** 読めた世代をすべて統合した状態 */
  | {
      kind: 'ok';
      doc: PortalSyncDoc;
      space: string | null;
      revs: string[];
      /** 余分な行・旧形式・複数世代が残っていて、書き直すと整理できる */
      untidy: boolean;
      usedRows: number;
    }
  /** 新しい版の拡張機能が書いたデータ（上書きしない） */
  | { kind: 'too-new' }
  /** 行はあるが、そろった世代を1つも読めない */
  | { kind: 'unreadable' };

type MarkerRow = { address: MarkerAddress; link: PortalUserLink };

function completeGroupWire(rows: MarkerRow[]): string | null {
  const sorted = [...rows].sort((a, b) => a.address.index - b.address.index);
  const expectedTotal = sorted[0]?.address.total ?? sorted.length;
  if (sorted.length !== expectedTotal || expectedTotal > PORTAL_SETTINGS_MARKER_MAX) return null;
  for (let i = 0; i < sorted.length; i += 1) {
    const { address, link } = sorted[i];
    if (address.index !== i) return null;
    if (address.total !== null && address.total !== expectedTotal) return null;
    if (link.biko.length > PORTAL_SETTINGS_BIKO_MAX) return null;
  }
  return sorted.map((row) => row.link.biko).join('');
}

/** 有効なマーカー行を世代ごとに分ける（旧形式の行は '' の組） */
function groupMarkerRows(links: readonly PortalUserLink[]): {
  groups: Map<string, MarkerRow[]>;
  activeRows: number;
} {
  const groups = new Map<string, MarkerRow[]>();
  let activeRows = 0;
  for (const link of links) {
    if (link.delFlg || !isPortalSettingsMarkerLink(link)) continue;
    activeRows += 1;
    const address = markerAddress(link);
    if (!address) continue;
    const groupKey = address.rev ?? '';
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), { address, link }]);
  }
  return { groups, activeRows };
}

type GroupRead = { kind: 'too-new' } | { kind: 'ok'; generation: DecodedPortalSyncGeneration };

async function readGroup(groupKey: string, rows: MarkerRow[]): Promise<GroupRead | null> {
  const wire = completeGroupWire(rows);
  if (wire === null) return null;
  // 壊れたデータで例外が出ても、その世代を「読めない」として扱い、同期全体は止めない。
  const decoded = await decodePortalSyncWire(wire).catch(() => ({ kind: 'unreadable' as const }));
  if (decoded.kind === 'too-new') return decoded;
  if (decoded.kind !== 'ok') return null;
  // URL の世代と中身の世代が食い違うものは採用しない。
  if (groupKey && decoded.generation.rev !== groupKey) return null;
  return decoded;
}

/** 最新の変更を含む世代の同期スペースを採用する */
function newestSpace(generations: readonly DecodedPortalSyncGeneration[]): string | null {
  let space: string | null = null;
  let clock = -1;
  for (const generation of generations) {
    const generationClock = maxPortalSyncStampTime(generation.doc);
    if (generation.space && generationClock > clock) {
      space = generation.space;
      clock = generationClock;
    }
  }
  return space;
}

/** マイリンク一覧から同期状態を読む。そろっていない世代は無視する。 */
export async function readPortalSyncMarkers(
  links: readonly PortalUserLink[],
): Promise<PortalSyncRemoteRead> {
  const { groups, activeRows } = groupMarkerRows(links);
  if (activeRows === 0) return { kind: 'empty' };

  const generations: DecodedPortalSyncGeneration[] = [];
  let usedRows = 0;
  for (const [groupKey, rows] of groups) {
    const read = await readGroup(groupKey, rows);
    if (read?.kind === 'too-new') return { kind: 'too-new' };
    if (!read) continue;
    generations.push(read.generation);
    usedRows += rows.length;
  }
  if (generations.length === 0) return { kind: 'unreadable' };

  const revs = generations.flatMap((generation) => (generation.rev ? [generation.rev] : []));
  return {
    kind: 'ok',
    doc: mergePortalSyncDocs(...generations.map((generation) => generation.doc)),
    space: newestSpace(generations),
    revs,
    untidy: generations.length > 1 || revs.length < generations.length || usedRows !== activeRows,
    usedRows,
  };
}

/**
 * 新しい世代の行を配置したマイリンク一覧を返す。
 * 既存のマーカー行を再利用し、使わなかった行は削除フラグを立てる。
 * ユーザーの通常のマイリンクには触れない。
 */
export function placePortalSyncMarkers(
  links: readonly PortalUserLink[],
  chunks: readonly string[],
  rev: string,
): PortalUserLink[] {
  if (chunks.length > PORTAL_SETTINGS_MARKER_MAX) {
    throw new Error(
      `同期データが上限を超えました（${chunks.length}/${PORTAL_SETTINGS_MARKER_MAX}）`,
    );
  }
  const nonMarkers = links.filter((link) => !isPortalSettingsMarkerLink(link));
  const markers = links.filter((link) => isPortalSettingsMarkerLink(link));
  // 再利用の優先度: 有効な行 → 削除済みの行。どちらも番号順。
  const reusable = [...markers].sort((a, b) => {
    if (a.delFlg !== b.delFlg) return a.delFlg ? 1 : -1;
    return (markerAddress(a)?.index ?? 0) - (markerAddress(b)?.index ?? 0);
  });

  let nextLinkNo = nextPortalLinkNo(links);
  const placed: PortalUserLink[] = chunks.map((biko, index) => {
    const existing = reusable[index];
    const base: PortalUserLink = existing ?? {
      id: '',
      version: '',
      delFlg: false,
      linkNo: nextLinkNo++,
      midashi: '',
      url: '',
      biko: '',
      order: -1,
    };
    return {
      ...base,
      midashi: portalSyncMarkerTitle(index),
      url: portalSyncMarkerUrl(index, rev, chunks.length),
      biko,
      delFlg: false,
    };
  });
  const retired = reusable
    .slice(chunks.length)
    .map((link) => (link.delFlg ? link : { ...link, delFlg: true }));

  return [...nonMarkers, ...placed, ...retired];
}

/** 同期用マーカーをすべて削除フラグにする（ユーザーの通常マイリンクは残す） */
export function retireAllPortalSyncMarkers(links: readonly PortalUserLink[]): PortalUserLink[] {
  return links.map((link) =>
    isPortalSettingsMarkerLink(link) && !link.delFlg ? { ...link, delFlg: true } : link,
  );
}
