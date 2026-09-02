/**
 * 設定パネル用チェンジログ JSON（releases 配列）の型とパース。
 */

export type ParsedChangelogRelease = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  notes: string[];
};

export function parseChangelogJson(json: unknown): ParsedChangelogRelease[] | null {
  if (!json || typeof json !== 'object') return null;
  const releases = (json as { releases?: unknown }).releases;
  if (!Array.isArray(releases)) return null;
  const out: ParsedChangelogRelease[] = [];
  for (const item of releases) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const version = typeof r.version === 'string' ? r.version.trim() : '';
    if (!version) continue;
    const date = typeof r.date === 'string' ? r.date.trim() : '';
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const highlights = Array.isArray(r.highlights)
      ? r.highlights.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const notes = Array.isArray(r.notes)
      ? r.notes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    out.push({ version, date, title, highlights, notes });
  }
  return out.length > 0 ? out : null;
}
