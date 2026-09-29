import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const NETWORK_APIS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']
const STATIC_ONLY =
  'Settle is a static client: receipt data never leaves the browser (M2 plan, D9).'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'public/vendor']),
  {
    // Plain JS gets the untyped rules only: no tsconfig includes these
    // files, so type-aware rules must never reach them.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
  },
  {
    // Tooling config files run under Node.
    files: ['*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // public/ is served unbundled as classic browser scripts.
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Static-only (M2 plan, D9, M-I-1): production code never opens a
    // network channel, so the only network reads are the libraries' own
    // GETs of the vendor/ files. Tests may stub fetch (R5-O-1).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.node.ts', 'src/test/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NETWORK_APIS.map((name) => ({ name, message: STATIC_ONLY })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: STATIC_ONLY },
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          NETWORK_APIS.map((property) => ({
            object,
            property,
            message: STATIC_ONLY,
          })),
        ),
      ],
    },
  },
  {
    // The app's Node scripts (vendor-assets, check-requests).
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  // Last, so it switches off every rule that would fight Prettier.
  prettier,
])
