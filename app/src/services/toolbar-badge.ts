/**
 * ツールバーのアイコンに、拡張機能をオフにしているあいだ「OFF」の印を付けます（background 用）。
 */

import { SK } from '../contract/storage-keys';
import { chromeStorageClient } from '../platform/storage/chrome-storage-client';

function showBadge(disabled: boolean): void {
  try {
    void browser.action.setBadgeText({ text: disabled ? 'OFF' : '' });
    if (disabled) void browser.action.setBadgeBackgroundColor({ color: '#6b7280' });
  } catch {
    /* action API が無い環境では何もしない */
  }
}

export function registerToolbarBadge(): void {
  void chromeStorageClient
    .get(SK.extensionUserDisabled)
    .then((data) => showBadge(data[SK.extensionUserDisabled] === true));
  chromeStorageClient.onChanged((changes, area) => {
    if (area !== 'local' || !(SK.extensionUserDisabled in changes)) return;
    showBadge(changes[SK.extensionUserDisabled]?.newValue === true);
  });
}
