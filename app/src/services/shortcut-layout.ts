/**
 * ショートカットの並び順・非表示（ポータル同期対象）。
 */

import { SK } from '../contract/storage-keys';
import storage from '../lib/storage';

export interface ShortcutLayout {
  order: string[];
  hidden: string[];
}

const EMPTY_LAYOUT: ShortcutLayout = { order: [], hidden: [] };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function parseShortcutLayout(raw: unknown): ShortcutLayout {
  if (!isRecord(raw)) return EMPTY_LAYOUT;
  const order = Array.isArray(raw.order)
    ? raw.order.filter((x): x is string => typeof x === 'string')
    : [];
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter((x): x is string => typeof x === 'string')
    : [];
  return { order, hidden };
}

export async function readShortcutLayout(): Promise<ShortcutLayout> {
  const data = await storage.get(SK.shortcutConfig);
  return parseShortcutLayout(data[SK.shortcutConfig]);
}

export async function saveShortcutLayout(layout: ShortcutLayout): Promise<void> {
  await storage.set({
    [SK.shortcutConfig]: {
      order: layout.order,
      hidden: layout.hidden,
      custom: [],
    },
  });
}
