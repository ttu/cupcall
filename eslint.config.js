import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

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
    plugins: { '@typescript-eslint': tseslint },
    rules: {
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
];
