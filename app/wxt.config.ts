import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';
import {
  COMMUNITY_API_ORIGIN,
  EXTENSION_PROMO_ORIGIN,
  HOME2_ORIGIN,
  KING_LMS_ORIGIN,
  PORTAL_ORIGIN,
} from './src/shared/constants';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const communityBoundaryDir = path.resolve(rootDir, '../../shared/community-boundary');

const { version } = JSON.parse(
  readFileSync(new URL('./version.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

type WxtGeckoBaseline = {
  id?: string;
  strict_min_version?: string;
  strict_max_version?: string;
  update_url?: string;
};

function buildHostPermissions(): string[] {
  const permissions = [
    `${PORTAL_ORIGIN}/*`,
    `${KING_LMS_ORIGIN}/*`,
    `${EXTENSION_PROMO_ORIGIN}/*`,
    `${HOME2_ORIGIN}/*`,
    `${COMMUNITY_API_ORIGIN}/*`,
  ];
  if (process.env.VITE_PORTAL_DISTRIBUTION_BUILD !== '1') {
    permissions.push('http://127.0.0.1:8787/*', 'http://localhost:8787/*');
  }
  return permissions;
}

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    resolve: {
      alias: {
        '@community-boundary': communityBoundaryDir,
      },
    },
  }),
  zip: {
    zipSources: false,
    artifactTemplate:
      process.env.VITE_PORTAL_DISTRIBUTION_BUILD === '1'
        ? '{{name}}-{{version}}-{{browser}}.zip'
        : '{{name}}-{{version}}-dev-{{browser}}.zip',
  },
  manifest: {
    name: 'KCGLMS+',
    version,
    description:
      'KCGの学生ポータルを見やすく再設計し、さまざまな便利機能を追加する非公式拡張機能です。',
    author: 'nnnnnnn0090' as unknown as { email: string },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    web_accessible_resources: [
      {
        resources: ['community/activity-icon.png'],
        matches: [`${PORTAL_ORIGIN}/*`],
      },
    ],
    minimum_chrome_version: '111',
    permissions: ['storage'],
    host_permissions: buildHostPermissions(),
    browser_specific_settings: {
      gecko: {
        id: 'kcg-portal-redesign-project@nnnnnnn0090.com',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
        update_url: `${EXTENSION_PROMO_ORIGIN}/updates.json`,
      } as WxtGeckoBaseline,
      gecko_android: { strict_min_version: '142.0' },
    },
  },
});
