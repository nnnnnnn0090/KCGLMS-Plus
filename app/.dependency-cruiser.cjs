/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'contract-isolation',
      severity: 'error',
      comment: 'contract は他レイヤに依存しない（§5.1）',
      from: { path: '^src/contract', pathNot: '\\.(test|spec)\\.' },
      to: {
        pathNot: '^(src/contract|\\.\\./\\.\\./shared/community-boundary/gate\\.ts$)',
      },
    },
    {
      name: 'domain-not-to-services-ui-entrypoints',
      severity: 'error',
      comment: 'domain は services/ui/entrypoints に依存しない（§5.1）',
      from: { path: '^src/domain' },
      to: {
        path: '^(src/services|src/entrypoints)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'platform-not-to-services-ui-entrypoints',
      severity: 'error',
      comment: 'platform は services/ui/entrypoints に依存しない（§5.1）',
      from: { path: '^src/platform' },
      to: {
        path: '^(src/services|src/entrypoints)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'services-not-to-ui-runtime',
      severity: 'error',
      comment: 'services は UI 実装に依存しない（§5.1）',
      from: {
        path: '^src/services',
        pathNot: '^src/services/portal-boot\\.ts$',
      },
      to: {
        path: '^src/ui',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'services-to-ui-boot-legacy',
      severity: 'ignore',
      comment: 'TASK-032 暫定: portal-boot の動的 import のみ許可。entrypoints 移行後に削除。',
      from: { path: '^src/services/portal-boot\\.ts$' },
      to: { path: '^src/ui' },
    },
    {
      name: 'ui-not-to-platform-direct',
      severity: 'error',
      comment: 'ui は platform を直接参照しない（§5.1）',
      from: { path: '^src/ui' },
      to: { path: '^src/platform' },
    },
    {
      name: 'ui-not-to-entrypoints',
      severity: 'error',
      comment: 'ui は entrypoints に依存しない（§5.1）',
      from: { path: '^src/ui' },
      to: { path: '^src/entrypoints' },
    },
    {
      name: 'ui-not-to-lib-unapproved',
      severity: 'error',
      comment:
        'ui→lib は UI 向けヘルパのみ許可（§5.1 / TASK-032）。未許可の lib 参照は services 化する。',
      from: { path: '^src/ui' },
      to: {
        path: '^src/lib',
        pathNot:
          '^src/lib/(api|cn|date|dom|extension-version|format-home2-mail-date|home2-mailhead-async|king-lms-course-sync|markdown|news-classification|portal-messages-pages|portal-nav-labels|runtime-element-style|storage)\\.ts$',
      },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'TASK-032: 参照されていない src モジュールを検出',
      from: {
        orphan: true,
        pathNot: [
          '^src/entrypoints',
          '\\.(test|spec)\\.(ts|tsx)$',
          '\\.d\\.ts$',
          '^src/ui/app/index\\.ts$',
          '^src/ui/components/index\\.ts$',
          '^src/ui/pages/index\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    exclude: { path: '(^|/)\\._' },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
