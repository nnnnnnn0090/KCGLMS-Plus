import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const communityBoundaryDir = path.resolve(rootDir, '../../shared/community-boundary');

export default defineConfig({
  resolve: {
    alias: {
      '@community-boundary': communityBoundaryDir,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/._*'],
    reporters: process.env.CI ? ['default'] : ['verbose'],
    env: {
      VITE_TELEMETRY_HMAC_SECRET: 'vitest-portal-sync-secret-key',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/._*', 'src/**/*.test.ts', 'src/entrypoints/**', 'src/domain/i18n/locales/**'],
      thresholds: {
        lines: 25,
        functions: 25,
        statements: 25,
        branches: 20,
      },
    },
  },
});
