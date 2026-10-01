// Adapted from holistics/dbml dbml-playground (eslint.config.ts), Apache-2.0. See NOTICE.
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vueEslintPlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig(
  js.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    semi: true,
    arrowParens: true,
    braceStyle: '1tbs',
  }),
  [
    {
      ignores: ['node_modules/', 'dist/', 'public/', '.claude/', 'vite.config.ts', 'eslint.config.js'],
    },
    vueEslintPlugin.configs['flat/strongly-recommended'],
    {
      files: ['**/*.{js,ts,vue}'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
          ...globals.browser,
          ...globals.es2022,
          ...globals.node,
          defineProps: 'readonly',
          defineEmits: 'readonly',
          defineExpose: 'readonly',
          defineModel: 'readonly',
          withDefaults: 'readonly',
        },
        parser: vueParser,
        parserOptions: {
          parser: {
            ts: tsparser,
          },
          extraFileExtensions: ['.vue'],
        },
      },
      plugins: {
        vue: vueEslintPlugin,
        '@typescript-eslint': tseslint,
        '@stylistic': stylistic,
      },
      rules: {
        ...js.configs.recommended.rules,
        ...tseslint.configs.recommended.rules,
        '@stylistic/object-curly-newline': ['error', {
          ImportDeclaration: { multiline: true, minProperties: 4 },
          ExportDeclaration: { multiline: true, minProperties: 4 },
          TSInterfaceBody: { multiline: true, minProperties: 1 },
        }],
        '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
        '@stylistic/space-before-function-paren': ['error', 'always'],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        'vue/multi-word-component-names': 'off',
        // SVG text content is whitespace-sensitive; keep it on one line.
        'vue/multiline-html-element-content-newline': ['warn', {
          ignores: ['pre', 'textarea', 'text', 'tspan', 'title', 'svg', 'a', 'abbr', 'b', 'code', 'em', 'i', 'kbd', 'label', 'small', 'span', 'strong', 'sub', 'sup'],
        }],
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
        'no-useless-escape': 'off',
        '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
        '@stylistic/max-statements-per-line': 'off',
        '@stylistic/operator-linebreak': ['error', 'before', { overrides: { '=': 'after' } }],
      },
    },
    // The engine stands alone (issue #8): relative imports only, and nothing of DBML, Monaco, or the editor's state.
    // Its tests may still build models from DBML through the editor's adapter.
    {
      files: ['src/engine/**/*.{ts,vue}'],
      ignores: ['src/engine/**/__tests__/**'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['@/*', '@dbml/*', 'monaco-editor', 'monaco-editor/*', 'pinia', 'yaml'],
            message: 'The engine stands alone: import its own modules relatively, and nothing of DBML, Monaco, Pinia, or the editor.',
          }],
        }],
      },
    },
    // Everyone else reaches the engine through its public surface.
    {
      files: ['src/**/*.{ts,vue}', 'cli/**/*.ts', 'plugins/**/*.ts'],
      ignores: ['src/engine/**'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            group: ['@/engine/*', '**/engine/*', '!@/engine/core'],
            message: "Import the engine from '@/engine', its public surface, or '@/engine/core' where no components can load.",
          }],
        }],
      },
    },
  ],
);
