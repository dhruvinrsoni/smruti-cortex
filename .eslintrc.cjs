module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    webextensions: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.mjs'],
  rules: {
    // TypeScript specific
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // General
    'no-console': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],

    // Complexity guardrails
    'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    'complexity': ['warn', 15],
    
    // Code style
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', 'only-multiline'],
    'indent': 'off', // Let TypeScript/Prettier handle this
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'max-lines-per-function': 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['src/popup/popup.ts', 'src/content_scripts/quick-search.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'no-console': 'off',
        'complexity': 'off',
      },
    },
  ],
};
