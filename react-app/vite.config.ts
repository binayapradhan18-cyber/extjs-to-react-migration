import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Alias, type UserConfig } from 'vite';

const bridgeSrc = (file: string) => fileURLToPath(new URL(`../packages/bridge/src/${file}`, import.meta.url));

// Consume the bridge from source so app, widget and tests never depend on a stale bridge build.
export const bridgeAliases: Alias[] = [
  { find: /^@migration\/bridge\/react$/, replacement: bridgeSrc('react.ts') },
  { find: /^@migration\/bridge$/, replacement: bridgeSrc('index.ts') },
];

// Zod ships comments Rollup cannot place; harmless, so keep the build log clean.
const onwarn: NonNullable<NonNullable<UserConfig['build']>['rollupOptions']>['onwarn'] = (warning, warn) => {
  if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('zod')) return;
  warn(warning);
};

export default defineConfig(({ mode }) => {
  if (mode === 'widget') {
    return {
      plugins: [react()],
      resolve: { alias: bridgeAliases },
      publicDir: false,
      // Library mode leaves process.env untouched; React needs it replaced for its production build.
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir: 'dist-widget',
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: { onwarn },
        lib: {
          entry: fileURLToPath(new URL('src/widget.tsx', import.meta.url)),
          formats: ['es'],
          fileName: () => 'tasks-widget.js',
        },
      },
    };
  }

  return {
    plugins: [react()],
    resolve: { alias: bridgeAliases },
    publicDir: fileURLToPath(new URL('../legacy-extjs/public', import.meta.url)),
    server: { port: 5174 },
    preview: { port: 4174 },
    build: { outDir: 'dist', sourcemap: true, rollupOptions: { onwarn } },
  };
});
