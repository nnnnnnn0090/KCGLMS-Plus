/**
 * 講義（Kogi）カレンダー向けの、ツールチップ解析やリンク解決のヘルパーです。
 * シラバス URL と King LMS コース URL の対応付けを行います。
 */

import { PORTAL_ORIGIN } from '../../shared/constants';

const SYLLABUS_BASE = `${PORTAL_ORIGIN}/Gakusei/web/Syllabus/WebSyllabusSansho/UI/WSL_SyllabusSansho.aspx`;

const PERIOD_TIMES: Record<number, string> = {
  1: '09:30 ~ 11:00',
  2: '11:10 ~ 12:40',
  3: '13:30 ~ 15:00',
  4: '15:10 ~ 16:40',
  5: '16:50 ~ 18:20',
};

// ─── ツールチップ解析 ─────────────────────────────────────────────────────

export function parseKogiMeta(tooltip: string): { period: string; room: string } {
  const t = String(tooltip ?? '');
  const periodM = t.match(/時限[：:]\s*(\d+)/);
  const roomM = t.match(/教室[：:]\s*([^<\r\n]+)/);
  return { period: periodM ? periodM[1] : '', room: roomM ? roomM[1].trim() : '' };
}

export function kogiPeriodTimeRange(periodStr: string): string {
  const n = parseInt(String(periodStr ?? '').trim(), 10);
  return PERIOD_TIMES[n] ?? '';
}

/** タイトル先頭の時限数字（例: "1 プログラミング入門" → "1", "プログラミング入門"）*/
export function parseLeadingPeriodTitle(title: string): { firstNum: string; rest: string } {
  const s = String(title ?? '').trim();
  const m = s.match(/^\s*(\d+)\s+(.+)$/s);
  if (m) return { firstNum: m[1], rest: m[2].trim() };
  return { firstNum: '', rest: s };
}

export function kogiPeriodNum(ev: { tooltip?: string; title?: string }): number | null {
  const { period } = parseKogiMeta(ev.tooltip ?? '');
  const { firstNum } = parseLeadingPeriodTitle(ev.title ?? '');
  const p = period || firstNum;
  const n = parseInt(String(p ?? '').trim(), 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return null;
  return n;
}

// ─── シラバス URL ────────────────────────────────────────────────────────

function parseKozaCode(tooltip: string, tipPlain: string): string {
  const re = /(?:講義コード|コード)\s*[：:]\s*([^\s<\r\n]+)/;
  const fromHtml = String(tooltip ?? '').match(re);
  if (fromHtml) return fromHtml[1].trim();
  const fromPlain = String(tipPlain ?? '').match(re);
  if (fromPlain) return fromPlain[1].trim();
  // 3 行目を講義コードとしてフォールバック
  const lines = String(tipPlain ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 3) {
    const labeled = lines[2].match(/^(?:講義コード|コード)\s*[：:]\s*(.+)$/);
    return (labeled ? labeled[1] : lines[2]).trim();
  }
  return '';
}

export function syllabusUrl(tooltip: string, tipPlain: string): string {
  const code = parseKozaCode(tooltip, tipPlain);
  if (!code) return '';
  const u = new URL(SYLLABUS_BASE);
  u.searchParams.set('P1', code);
  return u.href;
}

// ─── King LMS コース URL マッチング ──────────────────────────────────────

/** King LMS のコース一覧から表示名でコース URL を検索する */
export function findKingLmsUrl(
  courseRows: Array<{ displayName?: string; externalAccessUrl?: string }>,
  title: string,
): string {
  const rows = Array.isArray(courseRows) ? courseRows : [];
  if (rows.length === 0) return '';
  const { firstNum, rest } = parseLeadingPeriodTitle(title);
  if (!rest) return '';
  const candidates = rows.filter(
    (r) => r?.displayName && r?.externalAccessUrl && String(r.displayName).includes(rest),
  );
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return String(candidates[0].externalAccessUrl);
  // 曜日・時限が一致するものを優先（例: displayName に "月1" が含まれるか）
  const withPeriod = candidates.filter((r) => {
    if (!firstNum || !r.displayName) return true;
    // g フラグ付き regex は exec ごとに lastIndex が進むため、ループ前に毎回生成する
    const re = /(?:月|火|水|木|金|土|日)(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(r.displayName!)) !== null) {
      if (m[1] === firstNum) return true;
    }
    return false;
  });
  return String(
    withPeriod.length >= 1 ? withPeriod[0].externalAccessUrl : candidates[0].externalAccessUrl,
  );
}
