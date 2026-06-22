import { defineConfig, type Options } from 'tsup';

/**
 * Shared tsup preset for all publishable packages.
 * Dual ESM + CJS output, type declarations, tree-shakable.
 */
export function createTsupConfig(overrides: Options = {}) {
  return defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    minify: false,
    target: 'es2021',
    ...overrides,
  });
}
