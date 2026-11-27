import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  generateSessionToken,
  hashSessionToken,
  verifyPassword,
} from '../../core/auth/crypto';
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_CODE_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
} from '../../core/auth/middleware';
import { getEnv } from '../../core/env';
import { logWarn } from '../../core/logger';
import type { AuthRepository } from '../auth/repository';

const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const AUTH_CODE_TTL_SECONDS = 5 * 60; // 5 minutes
const CSRF_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes
const DEFAULT_SCOPES = ['budget:read', 'budget:write'] as const;

export interface McpStaticOAuthClient {
  clientId: string;
  clientSecret?: string;
}

export interface McpOAuthDependencies {
  authRepo: AuthRepository;
  getSigningSecret?: () => string;
  getStaticClient?: () => McpStaticOAuthClient | undefined;
}

type ResolvedOAuthClient =
  | {
      kind: 'static';
      clientId: string;
      clientName: string;
      authMethod: 'none' | 'client_secret_post';
      clientSecret?: string;
    }
  | {
      kind: 'dcr';
      clientId: string;
      clientName: string;
      redirectUris: string[];
      authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
      clientSecret?: string;
    };

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function defaultSigningSecret(): string {
  const direct = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (direct) {
    return direct;
  }
  return getEnv().DATA_ENCRYPTION_KEY;
}

function defaultStaticClient(): McpStaticOAuthClient | undefined {
  const clientId = process.env.MCP_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return undefined;
  }
  const clientSecret = process.env.MCP_OAUTH_CLIENT_SECRET?.trim();
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

function deriveSubkey(masterSecret: string, purpose: string): Buffer {
  return createHmac('sha256', masterSecret).update(purpose).digest();
}

function computeHmacTag(subkey: Buffer, data: string, length = 32): string {
  return createHmac('sha256', subkey)
    .update(data)
    .digest('base64url')
    .slice(0, length);
}

function signJsonToken(
  subkey: Buffer,
  prefix: string,
  payload: unknown,
  sigLength = 32,
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = computeHmacTag(subkey, encoded, sigLength);
  return `${prefix}${encoded}.${sig}`;
}

function verifyJsonToken<T>(
  subkey: Buffer,
  token: string,
  prefix: string,
  schema: z.ZodType<T>,
  sigLength = 32,
): T | null {
  if (!token.startsWith(prefix)) {
    return null;
  }
  const body = token.slice(prefix.length);
  const dotIdx = body.lastIndexOf('.');
  if (dotIdx <= 0) {
    return null;
  }
  const encoded = body.slice(0, dotIdx);
  const sig = body.slice(dotIdx + 1);
  const expectedSig = computeHmacTag(subkey, encoded, sigLength);
  if (!timingSafeEqualStrings(sig, expectedSig)) {
    return null;
  }
  try {
    const parsedJson: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    const parsed = schema.safeParse(parsedJson);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower === '127.0.0.1' || lower === '[::1]';
}

export function isValidOAuthRedirectUri(uriStr: string): boolean {
  try {
    const parsed = new URL(uriStr);
    if (parsed.hash) {
      return false;
    }
    if (parsed.protocol === 'https:') {
      return true;
    }
    if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function resolvePublicOrigin(c: {
  req: {
    url: string;
    header: (name: string) => string | undefined;
  };
}): string {
  const rawForwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = rawForwardedHost || c.req.header('host')?.trim();
  if (host) {
    const hostnameOnly = host.replace(/:\d+$/, '');
    const rawProto = c.req
      .header('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();
    const proto =
      rawProto === 'http' || rawProto === 'https'
        ? rawProto
        : isLoopbackHostname(hostnameOnly)
          ? 'http'
          : 'https';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return new URL(c.req.url).origin.replace(/\/+$/, '');
}

const dcrRequestSchema = z.object({
  redirect_uris: z
    .array(z.string().trim().min(1).refine(isValidOAuthRedirectUri, 'Invalid redirect URI'))
    .min(1)
    .max(10),
  client_name: z.string().trim().min(1).max(80).default('MCP Client'),
  token_endpoint_auth_method: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .default('client_secret_post'),
});

const dcrTokenPayloadSchema = z.object({
  v: z.literal(1),
  r: z.array(z.string().min(1)).min(1),
  n: z.string().min(1),
  m: z.enum(['none', 'client_secret_post', 'client_secret_basic']),
  t: z.number().int().nonnegative(),
});

const csrfPayloadSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().min(1),
  codeChallenge: z.string().min(1),
  state: z.string(),
  scope: z.string(),
  resource: z.string(),
  exp: z.number().int().positive(),
});

const authCodePayloadSchema = z.object({
  userId: z.string().min(1),
  clientId: z.string().min(1),
  redirectUri: z.string().min(1),
  codeChallenge: z.string().min(1),
  scope: z.string(),
  resource: z.string(),
  exp: z.number().int().positive(),
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAuthorizeHtml(params: {
  clientName: string;
  scope: string;
  csrfToken: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  resource: string;
  emailValue?: string;
  errorMessage?: string;
}): string {
  const safeClientName = escapeHtml(params.clientName);
  const safeEmail = escapeHtml(params.emailValue ?? '');
  const safeError = params.errorMessage ? escapeHtml(params.errorMessage) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Budget Tracker MCP</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAF8F4;
      color: #1C1B18;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #131210; color: #F4F1EA; }
      .card { background: #1B1A17 !important; border-color: #2E2B25 !important; }
      .scope-box { background: #24221E !important; border-color: #2E2B25 !important; }
      .muted { color: #ABA599 !important; }
      input { background: #24221E !important; color: #F4F1EA !important; border-color: #454037 !important; }
      .btn-cancel { background: #24221E !important; color: #F4F1EA !important; border-color: #2E2B25 !important; }
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #FFFFFF;
      border: 1px solid #E5E0D6;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 10px 30px rgba(28, 27, 24, 0.06);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      background: #EAF2EE;
      color: #1B4332;
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 8px; font-size: 20px; line-height: 1.25; }
    p { margin: 0 0 16px; font-size: 14px; line-height: 1.45; }
    .muted { color: #5C584F; }
    .scope-box {
      background: #F3F0EA;
      border: 1px solid #E5E0D6;
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 18px;
      font-size: 13px;
    }
    .scope-box ul { margin: 6px 0 0; padding-left: 18px; }
    .scope-box li { margin-bottom: 4px; }
    .error {
      background: #FDF1EE;
      color: #B4432C;
      border: 1px solid #E5E0D6;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 14px;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    input[type="email"], input[type="password"] {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border-radius: 12px;
      border: 1px solid #CFC8BA;
      background: #FAF8F4;
      font-size: 15px;
      margin-bottom: 14px;
    }
    .actions {
      display: flex;
      flex-direction: row-reverse;
      gap: 10px;
      margin-top: 6px;
    }
    button {
      flex: 1;
      min-height: 44px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
      padding: 10px 14px;
    }
    .btn-primary { background: #1B4332; color: #FAF8F4; }
    .btn-cancel { background: #F3F0EA; color: #1C1B18; border-color: #E5E0D6; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">Budget Tracker MCP</span>
    <h1>Connect ${safeClientName}</h1>
    <p class="muted">Sign in with your Budget Tracker account to allow <strong>${safeClientName}</strong> to read your budget and log or manage transactions.</p>

    <div class="scope-box">
      <strong>Requested permissions:</strong>
      <ul>
        <li>View accounts, categories, obligations, and recent transactions</li>
        <li>Log expenses, income, transfers, and obligation payments</li>
        <li>Delete transactions or undo obligation payments</li>
      </ul>
    </div>

    ${safeError ? `<div class="error" role="alert">${safeError}</div>` : ''}

    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="csrf_token" value="${escapeHtml(params.csrfToken)}" />
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
      <input type="hidden" name="resource" value="${escapeHtml(params.resource)}" />

      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" value="${safeEmail}" placeholder="you@example.com" />

      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" />

      <div class="actions">
        <button type="submit" name="decision" value="approve" class="btn-primary">Authorize &amp; Connect</button>
        <button type="submit" name="decision" value="deny" class="btn-cancel">Cancel</button>
      </div>
    </form>
  </main>
</body>
</html>`;
}

function renderRedirectHtml(params: {
  title: string;
  message: string;
  targetUrl: string;
  buttonLabel: string;
}): string {
  const safeTargetUrl = escapeHtml(params.targetUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${safeTargetUrl}" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAF8F4;
      color: #1C1B18;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #131210; color: #F4F1EA; }
      .card { background: #1B1A17 !important; border-color: #2E2B25 !important; }
      .muted { color: #ABA599 !important; }
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #FFFFFF;
      border: 1px solid #E5E0D6;
      border-radius: 20px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(28, 27, 24, 0.06);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      background: #EAF2EE;
      color: #1B4332;
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 8px; font-size: 20px; line-height: 1.25; }
    p { margin: 0 0 18px; font-size: 14px; line-height: 1.45; }
    .muted { color: #5C584F; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 44px;
      padding: 10px 16px;
      border-radius: 12px;
      background: #1B4332;
      color: #FAF8F4;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">Budget Tracker MCP</span>
    <h1>${escapeHtml(params.title)}</h1>
    <p class="muted">${escapeHtml(params.message)}</p>
    <a class="btn" href="${safeTargetUrl}">${escapeHtml(params.buttonLabel)}</a>
  </main>
</body>
</html>`;
}

function renderAuthorizeErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorization Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; background: #FAF8F4; color: #1C1B18; }
    .box { max-width: 440px; margin: 40px auto; background: #FFF; border: 1px solid #E5E0D6; border-radius: 16px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 18px; color: #B4432C; }
    p { margin: 0; font-size: 14px; color: #5C584F; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Invalid OAuth Request</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function resolveClient(
  clientId: string,
  dcrIdKey: Buffer,
  dcrSecretKey: Buffer,
  staticClient?: McpStaticOAuthClient,
): ResolvedOAuthClient | null {
  if (staticClient && timingSafeEqualStrings(clientId, staticClient.clientId)) {
    return {
      kind: 'static',
      clientId: staticClient.clientId,
      clientName: 'Budget Tracker MCP Client',
      authMethod: staticClient.clientSecret ? 'client_secret_post' : 'none',
      ...(staticClient.clientSecret
        ? { clientSecret: staticClient.clientSecret }
        : {}),
    };
  }

  const parsedDcr = verifyJsonToken(
    dcrIdKey,
    clientId,
    'dcr_',
    dcrTokenPayloadSchema,
    16,
  );
  if (!parsedDcr) {
    return null;
  }

  const clientSecret =
    parsedDcr.m !== 'none'
      ? `dcs_${computeHmacTag(dcrSecretKey, clientId, 32)}`
      : undefined;

  return {
    kind: 'dcr',
    clientId,
    clientName: parsedDcr.n,
    redirectUris: parsedDcr.r,
    authMethod: parsedDcr.m,
    ...(clientSecret ? { clientSecret } : {}),
  };
}

function isRedirectAllowedForClient(
  client: ResolvedOAuthClient,
  redirectUri: string,
): boolean {
  if (!isValidOAuthRedirectUri(redirectUri)) {
    return false;
  }
  if (client.kind === 'dcr') {
    return client.redirectUris.includes(redirectUri);
  }
  return true;
}

function parseBasicAuthHeader(
  headerValue: string | undefined,
): { clientId: string; clientSecret: string } | null {
  if (!headerValue || !headerValue.toLowerCase().startsWith('basic ')) {
    return null;
  }
  const encoded = headerValue.slice(6).trim();
  if (!encoded) {
    return null;
  }
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx <= 0) {
      return null;
    }
    const rawId = decoded.slice(0, colonIdx);
    const rawSecret = decoded.slice(colonIdx + 1);
    const decodePart = (val: string) => {
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    };
    return {
      clientId: decodePart(rawId),
      clientSecret: decodePart(rawSecret),
    };
  } catch {
    return null;
  }
}

export function createMcpOAuthRoutes(deps: McpOAuthDependencies) {
  const getSecret = deps.getSigningSecret ?? defaultSigningSecret;
  const getStaticClient = deps.getStaticClient ?? defaultStaticClient;

  const getKeys = () => {
    const master = getSecret();
    return {
      dcrIdKey: deriveSubkey(master, 'budget-tracker:mcp:dcr-id'),
      dcrSecretKey: deriveSubkey(master, 'budget-tracker:mcp:dcr-secret'),
      csrfKey: deriveSubkey(master, 'budget-tracker:mcp:oauth-csrf'),
      codeKey: deriveSubkey(master, 'budget-tracker:mcp:oauth-code'),
      rtBindKey: deriveSubkey(master, 'budget-tracker:mcp:oauth-rt-bind'),
    };
  };

  const buildProtectedResourceMetadata = (origin: string) => ({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: [...DEFAULT_SCOPES],
  });

  const buildAuthorizationServerMetadata = (origin: string) => ({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic',
    ],
    scopes_supported: [...DEFAULT_SCOPES],
  });

  return new Hono()
    .get('/.well-known/oauth-protected-resource', (c) => {
      const origin = resolvePublicOrigin(c);
      return c.json(buildProtectedResourceMetadata(origin));
    })
    .get('/.well-known/oauth-protected-resource/mcp', (c) => {
      const origin = resolvePublicOrigin(c);
      return c.json(buildProtectedResourceMetadata(origin));
    })
    .get('/.well-known/oauth-authorization-server', (c) => {
      const origin = resolvePublicOrigin(c);
      return c.json(buildAuthorizationServerMetadata(origin));
    })
    .get('/.well-known/openid-configuration', (c) => {
      const origin = resolvePublicOrigin(c);
      return c.json(buildAuthorizationServerMetadata(origin));
    })
    .post('/oauth/register', async (c) => {
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        return c.json(
          {
            error: 'invalid_client_metadata',
            error_description: 'Request body must be valid JSON.',
          },
          400,
        );
      }

      const parsed = dcrRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return c.json(
          {
            error: 'invalid_redirect_uri',
            error_description:
              parsed.error.issues[0]?.message ?? 'Invalid client registration metadata.',
          },
          400,
        );
      }

      const { dcrIdKey, dcrSecretKey } = getKeys();
      const issuedAt = Math.floor(Date.now() / 1000);
      const clientId = signJsonToken(
        dcrIdKey,
        'dcr_',
        {
          v: 1 as const,
          r: parsed.data.redirect_uris,
          n: parsed.data.client_name,
          m: parsed.data.token_endpoint_auth_method,
          t: issuedAt,
        },
        16,
      );

      const clientSecret =
        parsed.data.token_endpoint_auth_method !== 'none'
          ? `dcs_${computeHmacTag(dcrSecretKey, clientId, 32)}`
          : undefined;

      c.header('Cache-Control', 'no-store');
      return c.json(
        {
          client_id: clientId,
          ...(clientSecret
            ? { client_secret: clientSecret, client_secret_expires_at: 0 }
            : {}),
          client_id_issued_at: issuedAt,
          client_name: parsed.data.client_name,
          redirect_uris: parsed.data.redirect_uris,
          token_endpoint_auth_method: parsed.data.token_endpoint_auth_method,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        },
        201,
      );
    })
    .get('/oauth/authorize', (c) => {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');

      const responseType = c.req.query('response_type')?.trim();
      const clientId = c.req.query('client_id')?.trim() ?? '';
      const redirectUri = c.req.query('redirect_uri')?.trim() ?? '';
      const codeChallenge = c.req.query('code_challenge')?.trim() ?? '';
      const codeChallengeMethod =
        c.req.query('code_challenge_method')?.trim() || 'S256';
      const state = c.req.query('state') ?? '';
      const scope = c.req.query('scope')?.trim() || DEFAULT_SCOPES.join(' ');
      const resource = c.req.query('resource')?.trim() ?? '';

      if (responseType !== 'code') {
        return c.html(
          renderAuthorizeErrorPage('Only response_type=code is supported.'),
          400,
        );
      }

      const { dcrIdKey, dcrSecretKey, csrfKey } = getKeys();
      const client = resolveClient(
        clientId,
        dcrIdKey,
        dcrSecretKey,
        getStaticClient(),
      );
      if (!client) {
        return c.html(renderAuthorizeErrorPage('Unknown OAuth client_id.'), 400);
      }

      if (!isRedirectAllowedForClient(client, redirectUri)) {
        return c.html(
          renderAuthorizeErrorPage('Invalid or unregistered redirect_uri.'),
          400,
        );
      }

      if (codeChallengeMethod !== 'S256') {
        return c.html(
          renderAuthorizeErrorPage('PKCE code_challenge_method must be S256.'),
          400,
        );
      }

      if (
        codeChallenge.length < 43 ||
        codeChallenge.length > 128 ||
        !/^[A-Za-z0-9_-]+$/.test(codeChallenge)
      ) {
        return c.html(
          renderAuthorizeErrorPage('Missing or invalid PKCE code_challenge.'),
          400,
        );
      }

      const csrfToken = signJsonToken(csrfKey, 'csrf_', {
        clientId,
        redirectUri,
        codeChallenge,
        state,
        scope,
        resource,
        exp: Math.floor(Date.now() / 1000) + CSRF_TOKEN_TTL_SECONDS,
      });

      return c.html(
        renderAuthorizeHtml({
          clientName: client.clientName,
          scope,
          csrfToken,
          clientId,
          redirectUri,
          codeChallenge,
          codeChallengeMethod,
          state,
          resource,
        }),
      );
    })
    .post('/oauth/authorize', async (c) => {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');

      let bodyRecord: Record<string, string>;
      try {
        const parsedBody = await c.req.parseBody();
        bodyRecord = Object.fromEntries(
          Object.entries(parsedBody).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
        );
      } catch {
        return c.html(renderAuthorizeErrorPage('Invalid authorization form data.'), 400);
      }

      const csrfToken = bodyRecord.csrf_token?.trim() ?? '';
      const clientId = bodyRecord.client_id?.trim() ?? '';
      const redirectUri = bodyRecord.redirect_uri?.trim() ?? '';
      const codeChallenge = bodyRecord.code_challenge?.trim() ?? '';
      const codeChallengeMethod =
        bodyRecord.code_challenge_method?.trim() || 'S256';
      const state = bodyRecord.state ?? '';
      const scope = bodyRecord.scope?.trim() || DEFAULT_SCOPES.join(' ');
      const resource = bodyRecord.resource?.trim() ?? '';
      const decision = bodyRecord.decision?.trim() ?? 'approve';

      const { dcrIdKey, dcrSecretKey, csrfKey, codeKey } = getKeys();
      const verifiedCsrf = verifyJsonToken(
        csrfKey,
        csrfToken,
        'csrf_',
        csrfPayloadSchema,
      );
      const nowSec = Math.floor(Date.now() / 1000);
      if (
        !verifiedCsrf ||
        verifiedCsrf.exp < nowSec ||
        verifiedCsrf.clientId !== clientId ||
        verifiedCsrf.redirectUri !== redirectUri ||
        verifiedCsrf.codeChallenge !== codeChallenge ||
        verifiedCsrf.state !== state ||
        verifiedCsrf.resource !== resource
      ) {
        return c.html(
          renderAuthorizeErrorPage('Authorization session expired. Please retry.'),
          400,
        );
      }

      const client = resolveClient(
        clientId,
        dcrIdKey,
        dcrSecretKey,
        getStaticClient(),
      );
      if (!client || !isRedirectAllowedForClient(client, redirectUri)) {
        return c.html(renderAuthorizeErrorPage('Invalid OAuth client.'), 400);
      }

      if (decision === 'deny') {
        const target = new URL(redirectUri);
        target.searchParams.set('error', 'access_denied');
        if (state) {
          target.searchParams.set('state', state);
        }
        return c.html(
          renderRedirectHtml({
            title: 'Authorization Cancelled',
            message: `Returning to ${client.clientName}...`,
            targetUrl: target.toString(),
            buttonLabel: `Return to ${client.clientName}`,
          }),
          200,
        );
      }

      const email = (bodyRecord.email ?? '').trim().toLowerCase();
      const password = bodyRecord.password ?? '';

      const renderInvalidCredentials = (msg: string) => {
        const nextCsrf = signJsonToken(csrfKey, 'csrf_', {
          clientId,
          redirectUri,
          codeChallenge,
          state,
          scope,
          resource,
          exp: Math.floor(Date.now() / 1000) + CSRF_TOKEN_TTL_SECONDS,
        });
        return c.html(
          renderAuthorizeHtml({
            clientName: client.clientName,
            scope,
            csrfToken: nextCsrf,
            clientId,
            redirectUri,
            codeChallenge,
            codeChallengeMethod,
            state,
            resource,
            emailValue: bodyRecord.email ?? '',
            errorMessage: msg,
          }),
          401,
        );
      };

      if (!email || !password) {
        return renderInvalidCredentials('Please enter both your email and password.');
      }

      const userRecord = await deps.authRepo.findUserByEmail(email);
      if (!userRecord || !(await verifyPassword(password, userRecord.passwordHash))) {
        return renderInvalidCredentials('Invalid email or password.');
      }

      const code = signJsonToken(codeKey, OAUTH_CODE_TOKEN_PREFIX, {
        userId: userRecord.user.id,
        clientId,
        redirectUri,
        codeChallenge,
        scope,
        resource,
        exp: Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SECONDS,
      });

      await deps.authRepo.createSession({
        sessionId: `mcp-code-${randomUUID()}`,
        userId: userRecord.user.id,
        tokenHash: hashSessionToken(code),
        expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
      });

      const target = new URL(redirectUri);
      target.searchParams.set('code', code);
      if (state) {
        target.searchParams.set('state', state);
      }
      return c.html(
        renderRedirectHtml({
          title: 'Connected!',
          message: `Redirecting back to ${client.clientName} to finish setup...`,
          targetUrl: target.toString(),
          buttonLabel: `Continue to ${client.clientName}`,
        }),
        200,
      );
    })
    .post('/oauth/token', async (c) => {
      c.header('Cache-Control', 'no-store');
      c.header('Pragma', 'no-cache');

      let bodyRecord: Record<string, string> = {};
      const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
      try {
        if (contentType.includes('application/json')) {
          const json = (await c.req.json()) as Record<string, unknown>;
          for (const [k, v] of Object.entries(json)) {
            bodyRecord[k] = typeof v === 'string' ? v : '';
          }
        } else {
          const parsedBody = await c.req.parseBody();
          for (const [k, v] of Object.entries(parsedBody)) {
            bodyRecord[k] = typeof v === 'string' ? v : '';
          }
        }
      } catch {
        return c.json(
          {
            error: 'invalid_request',
            error_description: 'Malformed token request body.',
          },
          400,
        );
      }

      const basic = parseBasicAuthHeader(c.req.header('authorization'));
      const bodyClientId = bodyRecord.client_id?.trim() ?? '';
      const bodyClientSecret = bodyRecord.client_secret?.trim() ?? '';

      if (basic && bodyClientId && basic.clientId !== bodyClientId) {
        return c.json(
          {
            error: 'invalid_request',
            error_description: 'Conflicting client_id in header and body.',
          },
          400,
        );
      }

      const clientId = basic?.clientId || bodyClientId;
      const clientSecret = basic?.clientSecret || bodyClientSecret;
      const grantType = bodyRecord.grant_type?.trim();

      const rejectToken = (
        status: 400 | 401,
        error: string,
        errorDescription: string,
        reason: string,
      ) => {
        logWarn('mcp_oauth_token_rejected', {
          reason,
          grantType: grantType ?? null,
          hasBasic: Boolean(basic),
          hasBodyClientId: Boolean(bodyClientId),
        });
        return c.json({ error, error_description: errorDescription }, status);
      };

      if (!clientId) {
        return rejectToken(401, 'invalid_client', 'client_id is required.', 'missing_client_id');
      }

      const { dcrIdKey, dcrSecretKey, codeKey, rtBindKey } = getKeys();
      const client = resolveClient(
        clientId,
        dcrIdKey,
        dcrSecretKey,
        getStaticClient(),
      );
      if (!client) {
        return rejectToken(401, 'invalid_client', 'Unknown OAuth client_id.', 'unknown_client_id');
      }

      if (client.clientSecret) {
        if (
          !clientSecret ||
          !timingSafeEqualStrings(clientSecret, client.clientSecret)
        ) {
          return rejectToken(401, 'invalid_client', 'Invalid client_secret.', 'invalid_client_secret');
        }
      }
      const issueTokenPair = async (userId: string, scope: string) => {
        const accessToken = `${OAUTH_ACCESS_TOKEN_PREFIX}${generateSessionToken()}`;
        const rawRefresh = generateSessionToken();
        const rtBinding = computeHmacTag(
          rtBindKey,
          `${client.clientId}:${rawRefresh}`,
          24,
        );
        const refreshToken = `${OAUTH_REFRESH_TOKEN_PREFIX}${rawRefresh}.${rtBinding}`;

        await Promise.all([
          deps.authRepo.createSession({
            sessionId: `mcp-at-${randomUUID()}`,
            userId,
            tokenHash: hashSessionToken(accessToken),
            expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
          }),
          deps.authRepo.createSession({
            sessionId: `mcp-rt-${randomUUID()}`,
            userId,
            tokenHash: hashSessionToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
          }),
        ]);

        return c.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
          refresh_token: refreshToken,
          scope: scope || DEFAULT_SCOPES.join(' '),
        });
      };

      if (grantType === 'authorization_code') {
        const code = bodyRecord.code?.trim() ?? '';
        const redirectUri = bodyRecord.redirect_uri?.trim() ?? '';
        const codeVerifier = bodyRecord.code_verifier?.trim() ?? '';

        if (!code || !redirectUri || !codeVerifier) {
          return rejectToken(
            400,
            'invalid_request',
            'code, redirect_uri, and code_verifier are required.',
            'missing_auth_code_params',
          );
        }

        const payload = verifyJsonToken(
          codeKey,
          code,
          OAUTH_CODE_TOKEN_PREFIX,
          authCodePayloadSchema,
        );
        const nowSec = Math.floor(Date.now() / 1000);
        if (
          !payload ||
          payload.exp < nowSec ||
          payload.clientId !== client.clientId ||
          payload.redirectUri !== redirectUri
        ) {
          return rejectToken(
            400,
            'invalid_grant',
            'Authorization code is invalid or expired.',
            'invalid_or_mismatched_code',
          );
        }

        const computedChallenge = createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');
        if (!timingSafeEqualStrings(computedChallenge, payload.codeChallenge)) {
          return rejectToken(
            400,
            'invalid_grant',
            'Invalid PKCE code_verifier.',
            'pkce_mismatch',
          );
        }

        const codeSession = await deps.authRepo.verifySessionTokenHash(
          hashSessionToken(code),
        );
        if (!codeSession || codeSession.user.id !== payload.userId) {
          return rejectToken(
            400,
            'invalid_grant',
            'Authorization code has already been used or revoked.',
            'code_session_missing_or_used',
          );
        }

        await deps.authRepo.revokeSession(
          codeSession.sessionId,
          codeSession.user.id,
        );
        return issueTokenPair(codeSession.user.id, payload.scope);
      }

      if (grantType === 'refresh_token') {
        const refreshToken = bodyRecord.refresh_token?.trim() ?? '';
        if (!refreshToken.startsWith(OAUTH_REFRESH_TOKEN_PREFIX)) {
          return c.json(
            {
              error: 'invalid_grant',
              error_description: 'Invalid refresh_token.',
            },
            400,
          );
        }

        const body = refreshToken.slice(OAUTH_REFRESH_TOKEN_PREFIX.length);
        const dotIdx = body.lastIndexOf('.');
        if (dotIdx <= 0) {
          return c.json(
            {
              error: 'invalid_grant',
              error_description: 'Invalid refresh_token format.',
            },
            400,
          );
        }
        const rawRefresh = body.slice(0, dotIdx);
        const sig = body.slice(dotIdx + 1);
        const expectedSig = computeHmacTag(
          rtBindKey,
          `${client.clientId}:${rawRefresh}`,
          24,
        );
        if (!timingSafeEqualStrings(sig, expectedSig)) {
          return c.json(
            {
              error: 'invalid_grant',
              error_description: 'refresh_token is not bound to this client.',
            },
            400,
          );
        }

        const rtSession = await deps.authRepo.verifySessionTokenHash(
          hashSessionToken(refreshToken),
        );
        if (!rtSession) {
          return c.json(
            {
              error: 'invalid_grant',
              error_description: 'refresh_token is invalid or expired.',
            },
            400,
          );
        }

        await deps.authRepo.revokeSession(rtSession.sessionId, rtSession.user.id);
        return issueTokenPair(rtSession.user.id, DEFAULT_SCOPES.join(' '));
      }

      return c.json(
        {
          error: 'unsupported_grant_type',
          error_description:
            'Only authorization_code and refresh_token grants are supported.',
        },
        400,
      );
    });
}
