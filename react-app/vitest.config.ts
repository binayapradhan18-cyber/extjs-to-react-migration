import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { bridgeAliases } from './vite.config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: bridgeAliases },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
  },
});
