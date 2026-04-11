import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Service worker tests await real init + dynamic imports; v8 coverage slows that enough
    // to exceed the default 5s occasionally (e.g. CLEAR_FAVICON_CACHE after init gate).
    testTimeout: 15_000,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'src/__test-utils__/**',
        'src/popup/popup.ts',                // monolithic UI IIFE, no exports
        'src/content_scripts/quick-search.ts', // Shadow DOM IIFE, no exports
        'src/core/scorer-types.ts',           // type definitions only
        'src/background/schema.ts',           // type definitions only
      ],
    },
  },
});
