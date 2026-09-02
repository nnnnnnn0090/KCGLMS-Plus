import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/._*',
      'node_modules/**',
      '.output/**',
      '.wxt/**',
      'e2e/**',
      'scripts/**',
      '**/*.cjs',
      'playwright.config.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      complexity: ['warn', 15],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/entrypoints/**/*.ts', 'src/services/king-lms-hooks.ts'],
    rules: { 'prefer-rest-params': 'off' },
  },
  {
    files: [
      'src/domain/i18n/locales/**/*.ts',
      'src/domain/themes/additional-themes.ts',
      'src/domain/i18n/locales/theme-names.ts',
    ],
    rules: { 'max-lines': 'off', complexity: 'off' },
  },
  {
    files: ['src/ui/components/ui/guided-tour/**/*.tsx'],
    rules: { complexity: 'off', 'max-lines-per-function': 'off', 'max-lines': 'off' },
  },
);
