import { SK } from '../contract/storage-keys';
import {
  ensurePortalBackdrop,
  parseCustomThemeCollection,
  removePortalBackdrop,
} from '../domain/themes';
import { matchHome2MailRoute } from '../domain/home2/router';
import { storageRepo } from '../platform/storage/repo';
import { DEFAULT_THEME } from '../domain/themes/definitions';

/** home2-early: 黒カバー + overlay 判定（F-034） */
export async function applyHome2EarlyBootCover(): Promise<void> {
  const enabled = await storageRepo.getHome2WebMailOverlay();
  if (!enabled) return;

  const [themeName, customThemesRaw] = await Promise.all([
    storageRepo.getTheme(),
    storageRepo.getCustomThemes(),
  ]);
  const customThemes = parseCustomThemeCollection(customThemesRaw);
  ensurePortalBackdrop(themeName || DEFAULT_THEME, customThemes);
}

/** home2.content: ルート判定（F-034〜F-039） */
export function resolveHome2MailRoute() {
  return matchHome2MailRoute();
}

export async function isHome2OverlayEnabled(): Promise<boolean> {
  return storageRepo.getHome2WebMailOverlay();
}

export function teardownHome2Overlay(): void {
  removePortalBackdrop();
}

export { SK };
