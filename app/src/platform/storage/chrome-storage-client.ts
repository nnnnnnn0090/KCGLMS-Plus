/** `browser.storage.local` への直接アクセス。 */

export const chromeStorageClient = {
  get(keys: string | string[]): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      try {
        if (typeof browser !== 'undefined' && browser.storage?.local) {
          browser.storage.local
            .get(keys)
            .then(resolve)
            .catch(() => resolve({}));
          return;
        }
      } catch {
        /* ignore */
      }
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.get(keys, (r) => resolve(r ?? {}));
          return;
        }
      } catch {
        /* ignore */
      }
      resolve({});
    });
  },

  set(obj: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (typeof browser !== 'undefined' && browser.storage?.local) {
          browser.storage.local.set(obj).then(resolve).catch(resolve);
          return;
        }
      } catch {
        /* ignore */
      }
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set(obj, resolve);
          return;
        }
      } catch {
        /* ignore */
      }
      resolve();
    });
  },

  remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (typeof browser !== 'undefined' && browser.storage?.local) {
          browser.storage.local.remove(keys).then(resolve).catch(resolve);
          return;
        }
      } catch {
        /* ignore */
      }
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove(keys, resolve);
          return;
        }
      } catch {
        /* ignore */
      }
      resolve();
    });
  },

  onChanged(
    listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void,
  ): () => void {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
        browser.storage.onChanged.addListener(listener);
        return () => browser.storage.onChanged.removeListener(listener);
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
      }
    } catch {
      /* ignore */
    }
    return () => undefined;
  },
};
