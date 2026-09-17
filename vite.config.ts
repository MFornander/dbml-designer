import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileBridge } from './plugins/fileBridge.ts';

export default defineConfig(({ mode }) => {
  // Folders whose .dbml files the app may follow and save, colon-separated (DBML_ROOTS in the
  // environment or in .env.local). Without it, only files in this repo are reachable.
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  };
  const roots = (env.DBML_ROOTS ?? '').split(path.delimiter).map((s) => s.trim()).filter(Boolean);

  return {
    plugins: [vue(), tailwindcss(), fileBridge({ roots: roots.length ? roots : [process.cwd()] })],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Listen on every interface (dual-stack) so teammates on the LAN can open the preview at
      // http://<this-machine-ip>:5173, and 127.0.0.1 keeps working for local tools.
      host: true,
      port: 5173,
      strictPort: true,
      // Vite blocks unknown Host headers; IPs and localhost are always allowed, add Bonjour names.
      allowedHosts: ['.local'],
    },
    build: {
      target: 'esnext',
    },
    optimizeDeps: {
      include: ['monaco-editor', 'vue', '@dbml/parse'],
    },
    test: {
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'plugins/__tests__/**/*.test.ts', 'cli/__tests__/**/*.test.ts'],
    },
  };
});
