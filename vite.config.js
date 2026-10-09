import { defineConfig } from 'vite';

// base: './' makes the build work from any sub-path (e.g. GitHub Pages /neon-drift/)
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500
  },
  server: { open: true }
});
