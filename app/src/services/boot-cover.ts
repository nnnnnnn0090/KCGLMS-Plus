import { PORTAL_CONTENT_SCRIPT_MATCHES } from '../contract/origins';
import { SK } from '../contract/storage-keys';
import { DEFAULT_THEME, ensurePortalBackdrop, parseCustomThemeCollection } from '../domain/themes';
import { storageRepo } from '../platform/storage/repo';

/** portal-early: テーマ先行適用 + ブートカバー（F-002） */
export function isPortalEarlyTarget(): boolean {
  try {
    const pattern = PORTAL_CONTENT_SCRIPT_MATCHES.replace('*', '');
    return location.href.startsWith(pattern);
  } catch {
    return false;
  }
}

export function applyPortalEarlyBootCover(): void {
  if (!isPortalEarlyTarget()) return;

  ensurePortalBackdrop('dark');

  void storageRepo
    .getTheme()
    .then(async (themeName) => {
      const customThemes = await storageRepo.getCustomThemes();
      ensurePortalBackdrop(themeName || DEFAULT_THEME, customThemes);
    })
    .catch(() => {});
}

export { SK };
