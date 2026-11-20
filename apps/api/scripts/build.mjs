import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

await build({
  entryPoints: [path.join(apiRoot, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: path.join(apiRoot, 'tsconfig.json'),
  outfile: path.join(apiRoot, 'dist/index.js'),
  external: [
    'hono',
    'hono/*',
    '@hono/node-server',
    'drizzle-orm',
    'drizzle-orm/*',
    'pg',
    'dotenv',
    'dotenv/*',
    'zod',
  ],
});
