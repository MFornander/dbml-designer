import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileBridge } from './plugins/fileBridge.ts';
import { phosphorIcons } from './plugins/phosphorIcons.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const engineSrc = fileURLToPath(new URL('../engine/src', import.meta.url));

export default defineConfig(({ mode }) => {
  // Folders whose .dbml files the app may follow and save, colon-separated (DBML_ROOTS in the
  // environment or in .env.local at the repository root). Without it, only this repo's files are reachable.
  const env = {
    ...loadEnv(mode, repoRoot, ''),
    ...process.env,
  };
  const roots = (env.DBML_ROOTS ?? '').split(path.delimiter).map((s) => s.trim()).filter(Boolean);

  return {
    plugins: [vue(), tailwindcss(), phosphorIcons(), fileBridge({ roots: roots.length ? roots : [repoRoot] })],
    envDir: repoRoot,
    resolve: {
      // The editor uses the engine's source, so changes to it reload without a rebuild.
      alias: [
        {
          find: /^@dbml-designer\/engine\/core$/,
          replacement: `${engineSrc}/core.ts`,
        },
        {
          find: /^@dbml-designer\/engine$/,
          replacement: `${engineSrc}/index.ts`,
        },
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
      ],
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
      // `phosphorIcons()` loads each icon from its own file, so the barrel is never served.
      exclude: ['@phosphor-icons/vue'],
    },
    test: {
      name: 'editor',
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'plugins/__tests__/**/*.test.ts', 'cli/__tests__/**/*.test.ts'],
    },
  };
});
