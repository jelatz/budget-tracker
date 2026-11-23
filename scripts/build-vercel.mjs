import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercelOutputDir = path.join(rootDir, '.vercel', 'output');
const staticOutputDir = path.join(vercelOutputDir, 'static');
const funcDir = path.join(vercelOutputDir, 'functions', 'api', 'index.func');
const apiDir = path.join(rootDir, 'apps', 'api');
const apiDistDir = path.join(apiDir, 'dist');
const mobileDistDir = path.join(rootDir, 'apps', 'mobile', 'dist');

function run(command, cwd = rootDir) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolvePackageDir(pkgName, fromDir) {
  let cur = fromDir;
  while (true) {
    const candidate = path.join(cur, 'node_modules', pkgName);
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      throw new Error(`Could not resolve dependency "${pkgName}" from ${fromDir}`);
    }
    cur = parent;
  }
}

/**
 * Copies only the externalized runtime dependencies (pg and its transitive deps)
 * into a flat node_modules directory so Vercel functions avoid pnpm peer-dep bloat.
 */
function copyFlatRuntimeDeps(rootPkgNames, startDir, targetNodeModulesDir) {
  const collected = new Map();

  function walk(pkgName, fromDir) {
    const realDir = resolvePackageDir(pkgName, fromDir);
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(realDir, 'package.json'), 'utf8'),
    );
    if (collected.has(pkgJson.name)) {
      return;
    }
    collected.set(pkgJson.name, realDir);
    for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
      walk(dep, realDir);
    }
  }

  for (const name of rootPkgNames) {
    walk(name, startDir);
  }

  for (const [pkgName, srcDir] of collected) {
    const destDir = path.join(targetNodeModulesDir, pkgName);
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(srcDir, destDir, {
      recursive: true,
      dereference: true,
      filter: (src) => path.basename(src) !== 'node_modules',
    });
  }

  return Array.from(collected.keys());
}

// 1. Reset .vercel/output
fs.rmSync(vercelOutputDir, { recursive: true, force: true });
fs.mkdirSync(staticOutputDir, { recursive: true });
fs.mkdirSync(funcDir, { recursive: true });

// 2. Build @repo/api (produces apps/api/dist/index.js & apps/api/dist/vercel.mjs)
run('pnpm --filter @repo/api build');

// 3. Export @repo/mobile static web bundle (produces apps/mobile/dist)
run('pnpm --filter @repo/mobile exec npx expo export --platform web');

// 4. Copy static frontend assets into .vercel/output/static
if (!fs.existsSync(mobileDistDir)) {
  throw new Error(`Expected Expo web export directory at ${mobileDistDir}`);
}
fs.cpSync(mobileDistDir, staticOutputDir, { recursive: true });

// 5. Assemble .vercel/output/functions/api/index.func
const funcNodeModules = path.join(funcDir, 'node_modules');
fs.mkdirSync(funcNodeModules, { recursive: true });
const copiedDeps = copyFlatRuntimeDeps(['pg'], apiDir, funcNodeModules);

const pgPkgPath = path.join(funcNodeModules, 'pg', 'package.json');
if (!fs.existsSync(pgPkgPath)) {
  throw new Error(`Expected runtime dependency pg at ${pgPkgPath}`);
}

const vercelBundleSrc = path.join(apiDistDir, 'vercel.mjs');
const vercelMapSrc = path.join(apiDistDir, 'vercel.mjs.map');
if (!fs.existsSync(vercelBundleSrc)) {
  throw new Error(`Expected API Vercel bundle at ${vercelBundleSrc}`);
}
fs.copyFileSync(vercelBundleSrc, path.join(funcDir, 'index.mjs'));
if (fs.existsSync(vercelMapSrc)) {
  fs.copyFileSync(vercelMapSrc, path.join(funcDir, 'index.mjs.map'));
}

writeJson(path.join(funcDir, 'package.json'), {
  type: 'module',
});

writeJson(path.join(funcDir, '.vc-config.json'), {
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  shouldAddSourcemapSupport: true,
  supportsResponseStreaming: true,
});

// 6. Write Build Output API v3 routing config
writeJson(path.join(vercelOutputDir, 'config.json'), {
  version: 3,
  routes: [
    { src: '^/(health)$', dest: '/api/index?__path=/$1' },
    { src: '^/(v1(?:/.*)?)$', dest: '/api/index?__path=/$1' },
    { handle: 'filesystem' },
    { src: '^/([^/.]+)$', dest: '/$1.html', check: true },
    { src: '/(.*)', dest: '/index.html' },
  ],
});

console.log(
  `Vercel Build Output API v3 assembled at .vercel/output (${copiedDeps.length} external packages copied for pg)`,
);
