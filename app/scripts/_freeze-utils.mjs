import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = join(SCRIPT_DIR, '..');
export const SRC_ROOT = join(APP_ROOT, 'src');
export const GOLDEN_ROOT = join(APP_ROOT, '..', 'golden');

/** @param {string | Buffer} data */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** @param {string} filePath */
export function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

/**
 * Stable directory hash: relative paths sorted, each `path\0content`.
 * @param {string} dirPath
 * @param {(name: string, fullPath: string) => boolean} [filter]
 */
export function sha256Dir(dirPath, filter = () => true) {
  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const hash = createHash('sha256');
  const entries = [];

  /** @param {string} current */
  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      const fullPath = join(current, name);
      const relPath = relative(dirPath, fullPath).replace(/\\/g, '/');
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (filter(name, fullPath)) {
        entries.push({ relPath, fullPath });
      }
    }
  }

  walk(dirPath);
  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));

  for (const entry of entries) {
    hash.update(entry.relPath);
    hash.update('\0');
    hash.update(readFileSync(entry.fullPath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

/** @param {string} filePath */
export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** @param {string} filePath @param {unknown} data */
export function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** @returns {string[]} */
export function listContractFiles() {
  const contractDir = join(SRC_ROOT, 'contract');
  return readdirSync(contractDir)
    .filter((name) => !name.startsWith('._') && name.endsWith('.ts'))
    .sort()
    .map((name) => join('src/contract', name));
}

/** @returns {string[]} */
export function listI18nLocaleFiles() {
  const localesDir = join(SRC_ROOT, 'domain/i18n/locales');
  return readdirSync(localesDir)
    .filter((name) => !name.startsWith('._') && name.endsWith('.ts'))
    .sort()
    .map((name) => join('src/domain/i18n/locales', name));
}

/** @param {string} relPath */
export function readSourceFile(relPath) {
  return readFileSync(join(APP_ROOT, relPath), 'utf8');
}

/** @param {string[]} relPaths @param {string} label */
export function hashFileGroup(relPaths, label) {
  const hash = createHash('sha256');
  hash.update(`${label}\0`);
  for (const relPath of relPaths) {
    hash.update(relPath);
    hash.update('\0');
    hash.update(readSourceFile(relPath));
    hash.update('\0');
  }
  return hash.digest('hex');
}
