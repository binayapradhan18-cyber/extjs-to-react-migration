import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@migration\/bridge$/,
        replacement: fileURLToPath(new URL('../packages/bridge/src/index.ts', import.meta.url)),
      },
    ],
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('zod')) return;
        warn(warning);
      },
    },
  },
});
