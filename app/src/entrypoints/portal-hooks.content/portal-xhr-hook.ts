/**
 * `XMLHttpRequest` をラップし、フック対象のポータル API のレスポンス JSON を `dispatch` へ渡します。
 */

import { devWarn } from '../../lib/debug';
import { dispatch } from './portal-hook-dispatch';
import { shouldHook } from './portal-hook-paths';
import { captureXhrHeader } from './portal-header-cache';

export function installXhrHook(): void {
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    (this as XMLHttpRequest & { _portalUrl?: string })._portalUrl = String(url);
    return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>);
  };

  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    const self = this as XMLHttpRequest & { _portalUrl?: string };
    if (self._portalUrl) captureXhrHeader(self._portalUrl, name, value);
    return origSetHeader.apply(this, arguments as unknown as [string, string]);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    const self = this as XMLHttpRequest & { _portalUrl?: string };
    const u = String(self._portalUrl ?? '');
    if (shouldHook(u)) {
      this.addEventListener('load', function () {
        try {
          dispatch(u, JSON.parse(this.responseText));
        } catch (err) {
          devWarn('portal-hooks: XHR JSON parse failed', u, err);
        }
      });
    }
    return origSend.apply(this, arguments as unknown as Parameters<typeof origSend>);
  };
}
