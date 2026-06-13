import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: [
      // Subpath aliases must be listed before the root package alias so they take priority.
      // These aliases make workspace packages resolvable from scripts/ and normalize resolution
      // across all test contexts. Order matters: more-specific entries first.
      {
        find: '@cup/engine/testing',
        replacement: join(__dirname, 'packages/engine/src/__fixtures__/mini-tournament.ts'),
      },
      {
        find: '@cup/db/schema',
        replacement: join(__dirname, 'packages/db/src/schema/index.ts'),
      },
      {
        find: '@cup/db/testing',
        replacement: join(__dirname, 'packages/db/src/testing/make-test-db.ts'),
      },
      {
        find: '@cup/db',
        replacement: join(__dirname, 'packages/db/src/index.ts'),
      },
      {
        find: '@cup/engine',
        replacement: join(__dirname, 'packages/engine/src/index.ts'),
      },
      {
        find: '@cup/schemas',
        replacement: join(__dirname, 'packages/schemas/src/index.ts'),
      },
      {
        find: /^@\//,
        replacement: join(__dirname, 'apps/web/src/'),
      },
      // server-only throws in test environments — stub it out since tests run in Node.js
      {
        find: 'server-only',
        replacement: join(__dirname, '__mocks__/server-only.ts'),
      },
    ],
  },
  test: {
    include: ['{packages,apps}/**/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'packages/engine/src/**/*.ts',
        'packages/schemas/src/**/*.ts',
        'packages/db/src/**/*.ts',
        'apps/web/src/shared/**/*.ts',
        'apps/web/src/features/*/domain/**/*.ts',
        'apps/web/src/features/*/application/**/*.ts',
        'apps/web/src/features/*/api/**/*.ts',
        'scripts/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/__fixtures__/**',
        '**/testing/**',
        '**/migrations/**',
        '**/index.ts',
        '**/*.stories.{ts,tsx}',
      ],
    },
  },
});
