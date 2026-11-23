import { build } from 'esbuild';

const sharedOptions = {
  bundle: true,
  minify: true,
  treeShaking: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  tsconfig: 'tsconfig.json',
  sourcemap: true,
  external: ['pg', 'pg-native'],
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
  }),
  build({
    ...sharedOptions,
    entryPoints: ['src/vercel.ts'],
    outfile: 'dist/vercel.mjs',
  }),
]);
