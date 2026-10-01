// Adapted from holistics/dbml dbml-playground (eslint.config.ts), Apache-2.0. See NOTICE.
import { readFileSync } from 'node:fs';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vueEslintPlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import stylistic from '@stylistic/eslint-plugin';

/** The packages a workspace package's manifest declares, by section. */
function declared (dir, sections) {
  const manifest = JSON.parse(readFileSync(new URL(`./packages/${dir}/package.json`, import.meta.url), 'utf8'));
  return sections.flatMap((s) => Object.keys(manifest[s] ?? {}));
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A pattern matching every import that is none of: relative, a Node built-in, one of `prefixes`,
 * or one of `packages` (or a path inside it). npm hoists every dependency to the root, so without
 * this a package could import what it never declared.
 */
function undeclared (packages, prefixes = []) {
  const allowed = ['\\.{1,2}/', 'node:', ...prefixes.map(escape), `(?:${packages.map(escape).join('|')})(?:[/?]|$)`];
  return `^(?!(?:${allowed.join('|')}))`;
}

const engineRuntime = declared('engine', ['dependencies', 'peerDependencies']);
const engineAll = declared('engine', ['dependencies', 'peerDependencies', 'devDependencies']);
const editorAll = declared('editor', ['dependencies', 'devDependencies']);

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
      ignores: ['**/node_modules/', '**/dist/', '**/public/', '.claude/', '**/vite.config.ts', '**/vite.*.config.ts', 'vitest.config.ts', 'eslint.config.js'],
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
    // The engine stands alone (issue #8): its own modules, imported relatively, and the packages it
    // declares at run time; nothing of DBML, Monaco, Pinia, or the editor.
    {
      files: ['packages/engine/**/*.{ts,vue}'],
      ignores: ['packages/engine/**/__tests__/**'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            regex: undeclared(engineRuntime),
            message: 'The engine imports only its own modules, relatively, and the packages its package.json declares: nothing of DBML, Monaco, Pinia, or the editor.',
          }],
        }],
      },
    },
    // Its tests may also use their test tools, and describe a diagram in DBML through `#dbml-testing`.
    {
      files: ['packages/engine/**/__tests__/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [{
            regex: undeclared(engineAll, ['#dbml-testing']),
            message: "Engine tests import the engine relatively, the packages its package.json declares, and DBML input only through '#dbml-testing'.",
          }],
        }],
      },
    },
    // The editor imports what it declares, and the engine only through its public entries.
    {
      files: ['packages/editor/**/*.{ts,vue}'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            {
              regex: undeclared(editorAll, ['@/']),
              message: "The editor imports only its own modules and the packages its package.json declares.",
            },
            {
              regex: '^@dbml-designer/engine/(?!core$)',
              message: "Import the engine from '@dbml-designer/engine', or '@dbml-designer/engine/core' where no components can load.",
            },
          ],
        }],
      },
    },
  ],
);
