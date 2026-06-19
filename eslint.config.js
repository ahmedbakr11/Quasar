import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-ssr',
    'node_modules',
    'src-tauri/target',
    'Luna_Agent/.venv-release',
    'Luna_Agent/build',
    'Luna_Agent/dist',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      'src/components/agents/agent-audio-visualizer-grid.tsx',
      'src/components/agents/button-group.tsx',
      'src/components/agents/button.tsx',
      'src/components/agents/conversation.tsx',
      'src/components/ui/button.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
