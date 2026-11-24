import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
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

function run(command, cwd = rootDir, extraEnv = {}) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
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

const buildId =
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  `build-${Date.now()}`;

// 1. Reset .vercel/output
fs.rmSync(vercelOutputDir, { recursive: true, force: true });
fs.mkdirSync(staticOutputDir, { recursive: true });
fs.mkdirSync(funcDir, { recursive: true });

// 2. Build @repo/api (produces apps/api/dist/index.js & apps/api/dist/vercel.mjs)
run('pnpm --filter @repo/api build');

// 3. Export @repo/mobile static web bundle (produces apps/mobile/dist)
run('pnpm --filter @repo/mobile exec npx expo export --platform web', rootDir, {
  EXPO_PUBLIC_BUILD_ID: buildId,
});

// 4. Copy static frontend assets into .vercel/output/static and write version manifest
if (!fs.existsSync(mobileDistDir)) {
  throw new Error(`Expected Expo web export directory at ${mobileDistDir}`);
}
fs.cpSync(mobileDistDir, staticOutputDir, { recursive: true });

const requiredPwaAssets = [
  'manifest.webmanifest',
  'sw.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
for (const asset of requiredPwaAssets) {
  const assetPath = path.join(staticOutputDir, asset);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`Expected PWA static asset at ${assetPath}`);
  }
}

function verifyExportedHtml(htmlDir) {
  const htmlFiles = fs
    .readdirSync(htmlDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name);

  if (!htmlFiles.includes('index.html')) {
    throw new Error(`Expected exported index.html in ${htmlDir}`);
  }

  const contextHint =
    'Ensure apps/mobile/src/app/+html.tsx calls useServerDocumentContext() from "expo-router/html" and renders {headNodes} and {bodyNodes}.';

  const linkTagRegex = /<link\b[^>]*>/gi;
  const relStylesheetRegex = /\brel=["']stylesheet["']/i;
  const hrefRegex = /\bhref=["']([^"']+)["']/i;
  const scriptSrcRegex = /<script\b[^>]*\bsrc=["'](\/_expo\/static\/js\/[^"']+)["'][^>]*>/gi;

  for (const fileName of htmlFiles) {
    const html = fs.readFileSync(path.join(htmlDir, fileName), 'utf8');

    if (!html.includes('id="react-native-stylesheet"')) {
      throw new Error(
        `Exported ${fileName} is missing <style id="react-native-stylesheet">. ${contextHint}`,
      );
    }

    const cssHrefs = [];
    for (const tagMatch of html.matchAll(linkTagRegex)) {
      const tag = tagMatch[0];
      if (!relStylesheetRegex.test(tag)) {
        continue;
      }
      const hrefMatch = tag.match(hrefRegex);
      if (hrefMatch && hrefMatch[1].startsWith('/_expo/static/css/')) {
        cssHrefs.push(hrefMatch[1]);
      }
    }
    if (cssHrefs.length === 0) {
      throw new Error(
        `Exported ${fileName} is missing /_expo/static/css/ stylesheet links. ${contextHint}`,
      );
    }
    for (const cssHref of cssHrefs) {
      const diskPath = path.join(htmlDir, cssHref.replace(/^\/+/, ''));
      if (!fs.existsSync(diskPath)) {
        throw new Error(
          `Exported ${fileName} references missing stylesheet ${cssHref} (${diskPath}).`,
        );
      }
    }

    const jsSrcs = [];
    for (const scriptMatch of html.matchAll(scriptSrcRegex)) {
      jsSrcs.push(scriptMatch[1]);
    }
    if (!jsSrcs.some((src) => src.startsWith('/_expo/static/js/web/'))) {
      throw new Error(
        `Exported ${fileName} is missing /_expo/static/js/web/ bundle scripts. ${contextHint}`,
      );
    }
    for (const jsSrc of jsSrcs) {
      const diskPath = path.join(htmlDir, jsSrc.replace(/^\/+/, ''));
      if (!fs.existsSync(diskPath)) {
        throw new Error(
          `Exported ${fileName} references missing script ${jsSrc} (${diskPath}).`,
        );
      }
    }

    if (
      fileName === 'index.html' &&
      !/<link\b[^>]*\brel=["']manifest["'][^>]*\bhref=["']\/manifest\.webmanifest["']|<link\b[^>]*\bhref=["']\/manifest\.webmanifest["'][^>]*\brel=["']manifest["']/i.test(
        html,
      )
    ) {
      throw new Error(
        `Exported index.html is missing <link rel="manifest" href="/manifest.webmanifest">. ${contextHint}`,
      );
    }
  }
}

verifyExportedHtml(staticOutputDir);

writeJson(path.join(staticOutputDir, 'version.json'), {
  buildId,
  builtAt: new Date().toISOString(),
});

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

function collectInlineScriptHashes(htmlDir) {
  const hashes = new Set();
  if (!fs.existsSync(htmlDir)) {
    return [];
  }
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const entry of fs.readdirSync(htmlDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) {
      continue;
    }
    const html = fs.readFileSync(path.join(htmlDir, entry.name), 'utf8');
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const body = match[1];
      if (body && body.length > 0) {
        const digest = crypto
          .createHash('sha256')
          .update(body, 'utf8')
          .digest('base64');
        hashes.add(`'sha256-${digest}'`);
      }
    }
  }
  return Array.from(hashes);
}

const inlineScriptHashes = collectInlineScriptHashes(staticOutputDir);
const scriptSrcDirective = ['\'self\'', ...inlineScriptHashes].join(' ');
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrcDirective}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// 6. Write Build Output API v3 routing config
writeJson(path.join(vercelOutputDir, 'config.json'), {
  version: 3,
  routes: [
    {
      src: '^/.*',
      headers: {
        'Content-Security-Policy': contentSecurityPolicy,
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
      continue: true,
    },
    { src: '^/(health)$', dest: '/api/index?__path=/$1' },
    { src: '^/(v1(?:/.*)?)$', dest: '/api/index?__path=/$1' },
    {
      src: '^/version\\.json$',
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      continue: true,
    },
    {
      src: '^/manifest\\.webmanifest$',
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
      continue: true,
    },
    {
      src: '^/sw\\.js$',
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': '/',
      },
      continue: true,
    },
    {
      src: '^/icons/.*\\.png$',
      headers: { 'Cache-Control': 'public, max-age=86400' },
      continue: true,
    },
    {
      src: '^/(?:|[^/.]+(?:\\.html)?)$',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      continue: true,
    },
    {
      src: '^/_expo/static/.*',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    { handle: 'filesystem' },
    { src: '^/(?:_expo|assets|icons)/.*$', status: 404 },
    { src: '^/([^/.]+)$', dest: '/$1.html', check: true },
    { src: '/(.*)', dest: '/index.html' },
  ],
});

console.log(
  `Vercel Build Output API v3 assembled at .vercel/output (buildId: ${buildId}, ${copiedDeps.length} external packages copied for pg)`,
);
