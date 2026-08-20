import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Lint config for search-app. The rule that pays for this whole file is
// react-hooks/exhaustive-deps -- this app runs ~190 useEffects, many of them hand-rolling
// their own `cancelled` flag around a fetch, which is exactly where stale closures hide.
//
// eslint-plugin-react-hooks v7 ships the React Compiler rule set inside `recommended`, not
// just the classic rules-of-hooks/exhaustive-deps pair. Two of those compiler rules fire in
// bulk against code that already works and is already shipped (measured on first run:
// `refs` 54, `set-state-in-effect` 35). They are kept ON but at `warn`, so that:
//   - `npm run lint` is green today and a NEW error means something a human just broke, and
//   - the pre-existing backlog is still visible rather than silently switched off.
// Promote either to `error` once its warnings are worked down. `npm run lint:strict` fails
// on any warning at all, which is what CI should run if this ever gets CI.

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.vercel', 'undefined', 'public'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The four React Compiler rules below are kept ON but at 'warn'. Each was checked against
      // real call sites before being downgraded, and none flags a live bug: 'refs' and
      // 'set-state-in-effect' fire on the app's existing fetch-then-setState effects, while
      // 'use-memo' and 'static-components' are compiler *shape* constraints (e.g. useMemo(fn, [])
      // rather than useMemo(() => fn(), [])). They mark real React-Compiler adoption work, not
      // breakage, so they must not gate the build today.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/static-components': 'warn',
      // Vite HMR only reliably refreshes a module that exports components alone. The codebase
      // deliberately co-locates helpers/constants with components in places, so this is a
      // warning about a dev-time nicety, never a correctness failure.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The tree already carried hand-written `eslint-disable-next-line no-console` comments at
      // every deliberate console call (the engine bootstraps and the two serverless handlers),
      // written before any linter existed. Turning the rule on is what makes those directives mean
      // something, and catches a stray debug `console.log` shipping to prod.
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Node-side code: serverless functions, build/dev scripts, Vite config.
  {
    files: ['api/**/*.ts', 'scripts/**/*.{ts,mjs}', 'vite.config.ts', 'middleware.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
