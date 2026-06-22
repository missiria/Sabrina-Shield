import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Barrel re-exports and type-only modules contain no runtime logic.
        'src/**/index.ts',
        'src/**/types.ts',
        'src/interfaces/audit.ts',
        'src/interfaces/geo.ts',
        'src/interfaces/store.ts',
        'src/interfaces/request-context.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
