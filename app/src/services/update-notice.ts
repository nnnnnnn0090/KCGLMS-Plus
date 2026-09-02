/**
 * 拡張の manifest バージョンが前回より上がったときだけ一度だけ返すメッセージ（トースト用）。
 * 初回（記録なし）は Web へインストール通知し記録のみ。ダウングレード時は記録を上書きしメッセージは返さない。
 */

import { readExtensionVersion } from '../lib/extension-version';
import {
  notifyExtensionInstallToWeb,
  notifyExtensionUpdateToWeb,
} from '../lib/notify-extension-update';
import { semverGreater } from '../lib/semver';
import storage from '../lib/storage';
import { SK } from '../contract/storage-keys';
import { messagesForLanguage, type AppLanguage } from '../i18n/messages';

let inFlight: Promise<string> | null = null;

async function runConsume(language: AppLanguage): Promise<string> {
  const current = readExtensionVersion();
  if (!current) return '';

  const snap = await storage.get([SK.extensionVersionSeen]);
  const seenRaw = snap[SK.extensionVersionSeen];
  const seen = typeof seenRaw === 'string' ? seenRaw.trim() : '';

  if (!seen) {
    await storage.set({ [SK.extensionVersionSeen]: current });
    void notifyExtensionInstallToWeb(current);
    return '';
  }
  if (seen === current) return '';

  if (!semverGreater(current, seen)) {
    await storage.set({ [SK.extensionVersionSeen]: current });
    return '';
  }

  await storage.set({ [SK.extensionVersionSeen]: current });
  void notifyExtensionUpdateToWeb(seen, current);
  return messagesForLanguage(language).sync.updated(current);
}

/** 同時呼び出しは 1 本にまとめる（Strict Mode 等での二重取得を避ける） */
export function consumeExtensionUpdateToastMessage(language: AppLanguage): Promise<string> {
  if (!inFlight) {
    inFlight = runConsume(language).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
