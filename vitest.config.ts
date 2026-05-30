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
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'src/__test-utils__/**',
        'src/popup/popup.ts',                // monolithic UI IIFE, no exports
        'src/content_scripts/quick-search.ts', // Shadow DOM IIFE, no exports
        'src/welcome/welcome.ts',             // welcome-page DOM entry IIFE (logic lives in welcome-content.ts)
        'src/core/scorer-types.ts',           // type definitions only
        'src/background/schema.ts',           // type definitions only
      ],
      thresholds: {
        // Hard floors only — set well below current achievement to keep
        // release velocity high. The ratchet (scripts/coverage-ratchet.mjs,
        // floors 70/80/90) is the active quality bar; vitest's gate just
        // catches catastrophic regressions. Don't raise back to ≥90 unless
        // you also want every routine commit to fight a tightening gate.
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
