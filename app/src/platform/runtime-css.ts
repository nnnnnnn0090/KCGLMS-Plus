import { RUNTIME_CSS_FALLBACK_ID } from '../contract/dom';

const runtimeSheets = new Map<string, CSSStyleSheet>();
const runtimeCssTexts = new Map<string, string>();

let constructableSheetsUsable: boolean | null = null;
let fallbackStyleNode: HTMLStyleElement | null = null;

function canUseConstructableSheets(): boolean {
  if (constructableSheetsUsable != null) return constructableSheetsUsable;
  try {
    constructableSheetsUsable =
      typeof CSSStyleSheet !== 'undefined' &&
      typeof document !== 'undefined' &&
      'adoptedStyleSheets' in document &&
      Boolean(document.adoptedStyleSheets);
  } catch {
    constructableSheetsUsable = false;
  }
  return constructableSheetsUsable;
}

function readAdoptedSheets(): CSSStyleSheet[] {
  let sheets: ArrayLike<CSSStyleSheet> | undefined;
  try {
    sheets = document.adoptedStyleSheets as ArrayLike<CSSStyleSheet> | undefined;
  } catch {
    constructableSheetsUsable = false;
    return [];
  }

  const out: CSSStyleSheet[] = [];
  if (sheets) {
    for (let index = 0; index < sheets.length; index += 1) {
      const sheet = sheets[index];
      if (sheet) out.push(sheet);
    }
  }
  return out;
}

function flushFallbackStyleNode(): void {
  if (!fallbackStyleNode) return;
  fallbackStyleNode.textContent = [...runtimeCssTexts.values()].join('\n');
}

function ensureFallbackStyleNode(): HTMLStyleElement | null {
  if (fallbackStyleNode?.isConnected) return fallbackStyleNode;
  if (typeof document === 'undefined') return null;

  const existing = document.getElementById(RUNTIME_CSS_FALLBACK_ID);
  if (existing instanceof HTMLStyleElement) {
    fallbackStyleNode = existing;
    return fallbackStyleNode;
  }

  const node = document.createElement('style');
  node.id = RUNTIME_CSS_FALLBACK_ID;
  node.type = 'text/css';
  node.setAttribute('data-kcg-runtime-css', 'true');
  const parent = document.head ?? document.documentElement;
  if (!parent) return null;
  parent.appendChild(node);
  fallbackStyleNode = node;
  return fallbackStyleNode;
}

function upsertConstructableCss(id: string, cssText: string): boolean {
  if (!canUseConstructableSheets()) return false;

  try {
    let sheet = runtimeSheets.get(id);
    if (!sheet) {
      sheet = new CSSStyleSheet();
      runtimeSheets.set(id, sheet);
      document.adoptedStyleSheets = [...readAdoptedSheets(), sheet];
    }
    sheet.replaceSync(cssText);
    return true;
  } catch {
    runtimeSheets.delete(id);
    constructableSheetsUsable = false;
    return false;
  }
}

export function upsertRuntimeCss(id: string, cssText: string): void {
  runtimeCssTexts.set(id, cssText);

  if (upsertConstructableCss(id, cssText)) return;

  if (!ensureFallbackStyleNode()) return;
  flushFallbackStyleNode();
}

export function removeRuntimeCss(id: string): void {
  runtimeCssTexts.delete(id);

  const sheet = runtimeSheets.get(id);
  if (sheet && canUseConstructableSheets()) {
    try {
      runtimeSheets.delete(id);
      document.adoptedStyleSheets = readAdoptedSheets().filter((entry) => entry !== sheet);
    } catch {
      constructableSheetsUsable = false;
    }
  }

  flushFallbackStyleNode();
}
