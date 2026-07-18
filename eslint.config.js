import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '*.config.ts',
      '**/coverage/**',
    ],
  },
  {
    files: ['{packages,apps}/**/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsparser, parserOptions: { project: true } },
    plugins: { '@typescript-eslint': tseslint, sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Would require a mechanical refactor of nearly every component/ternary in the
      // codebase; off until we decide to take that on deliberately.
      'sonarjs/prefer-read-only-props': 'off',
      'sonarjs/no-nested-conditional': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/!(index)', '**/features/*/*/**'],
              message: 'Import features only via their index.ts public interface.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['{packages,apps}/**/src/**/*.tsx'],
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      // Matches the "nesting 4+ levels deep" extraction signal in CLAUDE.md's UI guidance.
      'react/jsx-max-depth': ['error', { max: 4 }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
