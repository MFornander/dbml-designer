import { defineConfig } from 'vitest/config';

// Each package runs its own tests with its own Vite config.
export default defineConfig({
  test: {
    projects: ['packages/engine', 'packages/editor'],
  },
});
