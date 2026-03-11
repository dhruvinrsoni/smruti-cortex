import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
        'src/popup/popup.ts',
        'src/content_scripts/quick-search.ts',
        'src/shared/search-ui-base.ts',
        'src/core/scorer-types.ts',
        'src/background/schema.ts',
        'src/background/search/scorers/ai-scorer-placeholder.ts',
        'src/background/service-worker.ts',
        'src/content_scripts/extractor.ts',
      ],
    },
  },
});
