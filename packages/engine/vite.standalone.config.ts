import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The engine with Vue and its other dependencies bundled in, for hosts without Vue (React and the rest).
export default defineConfig({
  plugins: [vue()],
  // A library build leaves these alone; the bundled Vue reads them.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/standalone.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'standalone',
    },
    outDir: 'dist/standalone',
    sourcemap: true,
    target: 'es2022',
  },
});
