/**
 * LinkEditor の行組み立て（テスト可能な純関数）。
 */

import { HOME_SHORTCUT_EXTRAS } from '../../../shared/constants';
import type { PortalUserLink } from '../../../services/user-html-link';
import { activePortalUserLinks } from '../../../services/user-html-link';
import { isPortalSettingsMarkerLink } from '../../../services/portal-settings-sync';

export interface ApiLink {
  midashi: string;
  url: string;
  biko?: string;
  kubun?: number;
}

export interface LinkEditorRow {
  key: string;
  midashi: string;
  url: string;
  biko: string;
  isCustom: boolean;
  portalId?: string;
}

export function linkKey(url: string): string {
  return String(url ?? '').replace(/\/+$/, '');
}

export const LINK_EDITOR_EXTRAS: ApiLink[] = HOME_SHORTCUT_EXTRAS.map((e) => ({
  midashi: e.midashi,
  url: e.url,
}));

function isUserLink(item: ApiLink, userLinks: PortalUserLink[]): boolean {
  if (item.kubun === 1) return true;
  const key = linkKey(item.url);
  return userLinks.some(
    (link) => !link.delFlg && !isPortalSettingsMarkerLink(link) && linkKey(link.url) === key,
  );
}

function portalIdForItem(item: ApiLink, userLinks: PortalUserLink[]): string | undefined {
  const key = linkKey(item.url);
  const exact = userLinks.find(
    (link) => !link.delFlg && linkKey(link.url) === key && link.midashi === item.midashi,
  );
  if (exact?.id) return exact.id;
  return userLinks.find((link) => !link.delFlg && linkKey(link.url) === key)?.id;
}

export function orderLinkEditorRows(rows: LinkEditorRow[], order: string[]): LinkEditorRow[] {
  if (order.length === 0) return rows;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ordered: LinkEditorRow[] = [];
  const seen = new Set<string>();
  for (const key of order) {
    const row = byKey.get(key);
    if (!row || seen.has(key)) continue;
    ordered.push(row);
    seen.add(key);
  }
  for (const row of rows) {
    if (!seen.has(row.key)) ordered.push(row);
  }
  return ordered;
}

export function buildLinkEditorRows(
  items: ApiLink[],
  extras: ApiLink[],
  userLinks: PortalUserLink[],
): LinkEditorRow[] {
  const extraUrls = new Set(extras.filter((i) => i.midashi && i.url).map((i) => linkKey(i.url)));
  const fromApi = items.filter(
    (i) =>
      i.midashi &&
      i.url &&
      !extraUrls.has(linkKey(i.url)) &&
      !isPortalSettingsMarkerLink({ midashi: i.midashi, url: i.url }),
  );

  const allRaw: LinkEditorRow[] = [
    ...extras
      .filter((i) => i.midashi && i.url)
      .map((r) => ({
        key: linkKey(r.url),
        midashi: r.midashi,
        url: r.url,
        biko: r.biko ?? '',
        isCustom: false,
      })),
    ...fromApi.map((r) => {
      const custom = isUserLink(r, userLinks);
      return {
        key: linkKey(r.url),
        midashi: r.midashi,
        url: r.url,
        biko: r.biko ?? '',
        isCustom: custom,
        portalId: custom ? portalIdForItem(r, userLinks) : undefined,
      };
    }),
  ];

  const seenForAppend = new Set(allRaw.map((r) => (r.portalId ? `portal:${r.portalId}` : r.key)));
  for (const link of activePortalUserLinks(userLinks)) {
    if (isPortalSettingsMarkerLink(link)) continue;
    const dedupeKey = `portal:${link.id}`;
    if (seenForAppend.has(dedupeKey)) continue;
    allRaw.push({
      key: linkKey(link.url),
      midashi: link.midashi,
      url: link.url,
      biko: link.biko ?? '',
      isCustom: true,
      portalId: link.id,
    });
    seenForAppend.add(dedupeKey);
  }

  const seen = new Set<string>();
  return allRaw.filter((r) => {
    const dedupeKey = r.isCustom && r.portalId ? `portal:${r.portalId}` : r.key;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}
