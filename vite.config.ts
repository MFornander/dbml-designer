import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
