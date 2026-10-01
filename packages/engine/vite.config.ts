import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const engineSrc = fileURLToPath(new URL('./src', import.meta.url));
const editorSrc = fileURLToPath(new URL('../editor/src', import.meta.url));

/** What the host provides: the engine's dependencies and Vue, left out of the library build. */
const external = /^(vue|@phosphor-icons\/vue|marked|dompurify)(\/|$)/;

export default defineConfig({
  plugins: [vue()],
  build: {
    // `index` for Vue hosts, `core` for anything without a DOM; `vite.standalone.config.ts` bundles Vue in for the rest.
    lib: {
      entry: {
        index: `${engineSrc}/index.ts`,
        core: `${engineSrc}/core.ts`,
      },
      formats: ['es'],
    },
    rolldownOptions: {
      external: (id) => external.test(id),
    },
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    name: 'engine',
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // The diagram inlines its stylesheet; let tests see it.
    css: {
      include: [/diagram\.css/],
    },
    // Tests that describe their diagram in DBML convert it through the editor's adapter, reached
    // only through `#dbml-testing`; the engine's own code never sees DBML.
    alias: [
      {
        find: '#dbml-testing',
        replacement: `${editorSrc}/dbml/__tests__/engineTesting.ts`,
      },
      {
        find: /^@dbml-designer\/engine\/core$/,
        replacement: `${engineSrc}/core.ts`,
      },
      {
        find: /^@dbml-designer\/engine$/,
        replacement: `${engineSrc}/index.ts`,
      },
      {
        find: /^@\//,
        replacement: `${editorSrc}/`,
      },
    ],
  },
});
