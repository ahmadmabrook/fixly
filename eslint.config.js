import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Workspace-wide flat ESLint config (backend + web + admin).
 * Type-aware linting is intentionally OFF (fast, no project service needed in
 * CI); the recommended TS rules catch the high-value mistakes. A few noisy
 * rules are downgraded to warnings so the lint step gates on real errors only.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.{js,ts}',
      '**/setupTests.ts',
      'backend/prisma/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Tests lean on casts/mocks/dynamic requires — relax the strictest rules.
    files: ['**/*.test.{ts,tsx}', '**/test-utils.*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
