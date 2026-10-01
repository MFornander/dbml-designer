import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const engineSrc = fileURLToPath(new URL('./src', import.meta.url));
const editorSrc = fileURLToPath(new URL('../editor/src', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'engine',
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
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
