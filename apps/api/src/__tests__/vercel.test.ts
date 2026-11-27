import { afterEach, describe, expect, it } from 'vitest';
import {
  getEnv,
  getVercelDeploymentOrigins,
  isLocalDevOrigin,
  parseAllowedCorsOrigins,
  resetEnvCache,
} from '../core/env';
import { resetVercelHandlerCache, restoreVercelRequestUrl } from '../vercel';

describe('Vercel adapter helpers', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    resetEnvCache();
    resetVercelHandlerCache();
  });

  describe('restoreVercelRequestUrl', () => {
    it('restores /health from /api/index?__path=/health', () => {
      expect(restoreVercelRequestUrl('/api/index?__path=/health')).toBe('/health');
    });

    it('restores /v1/sync with preserved query parameters', () => {
      expect(
        restoreVercelRequestUrl('/api/index?__path=/v1/sync&sinceRevision=5'),
      ).toBe('/v1/sync?sinceRevision=5');
    });

    it('normalizes missing leading slash and preserves multiple query params', () => {
      expect(
        restoreVercelRequestUrl(
          '/v1/transactions?__path=v1/transactions&accountId=acc-1&limit=20',
        ),
      ).toBe('/v1/transactions?accountId=acc-1&limit=20');
    });

    it('passes through URLs without __path untouched', () => {
      expect(restoreVercelRequestUrl('/v1/meta')).toBe('/v1/meta');
      expect(restoreVercelRequestUrl('/v1/sync?sinceRevision=2')).toBe(
        '/v1/sync?sinceRevision=2',
      );
    });

    it('defaults undefined URLs to /', () => {
      expect(restoreVercelRequestUrl(undefined)).toBe('/');
    });

    it('restores /mcp, /oauth/*, and /.well-known/* forwarded paths with query params', () => {
      expect(restoreVercelRequestUrl('/api/index?__path=/mcp')).toBe('/mcp');
      expect(
        restoreVercelRequestUrl(
          '/api/index?__path=/oauth/authorize&response_type=code&state=abc',
        ),
      ).toBe('/oauth/authorize?response_type=code&state=abc');
      expect(
        restoreVercelRequestUrl(
          '/api/index?__path=/.well-known/oauth-protected-resource',
        ),
      ).toBe('/.well-known/oauth-protected-resource');
    });
  });

  describe('Vercel CORS and env defaults', () => {
    it('extracts deduplicated https origins from Vercel deployment host env vars', () => {
      const origins = getVercelDeploymentOrigins({
        VERCEL_URL: 'budget-tracker-preview-123.vercel.app',
        VERCEL_BRANCH_URL: 'https://budget-tracker-git-main.vercel.app/',
        VERCEL_PROJECT_PRODUCTION_URL: 'budget-tracker.vercel.app',
      });

      expect(origins).toEqual([
        'https://budget-tracker-preview-123.vercel.app',
        'https://budget-tracker-git-main.vercel.app',
        'https://budget-tracker.vercel.app',
      ]);
    });

    it('includes Vercel deployment origins in production mode even when CORS_ORIGINS is empty', () => {
      const origins = parseAllowedCorsOrigins('', 'production', {
        VERCEL_URL: 'budget-tracker-abc.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'budget-tracker.vercel.app',
      });

      expect(origins).toEqual([
        'https://budget-tracker-abc.vercel.app',
        'https://budget-tracker.vercel.app',
      ]);
    });

    it('merges explicit CORS_ORIGINS with Vercel deployment origins without duplicates', () => {
      const origins = parseAllowedCorsOrigins(
        'https://custom.example.com/, https://budget-tracker.vercel.app',
        'production',
        {
          VERCEL_URL: 'budget-tracker-abc.vercel.app',
          VERCEL_PROJECT_PRODUCTION_URL: 'budget-tracker.vercel.app',
        },
      );

      expect(origins).toEqual([
        'https://custom.example.com',
        'https://budget-tracker.vercel.app',
        'https://budget-tracker-abc.vercel.app',
      ]);
    });

    it('preserves existing behavior when no VERCEL_* env vars are set', () => {
      expect(parseAllowedCorsOrigins('https://budget-tracker.pages.dev', 'production', {})).toEqual(
        ['https://budget-tracker.pages.dev'],
      );
    });

    it('defaults DB_POOL_MAX to 2 when VERCEL=1 and DB_POOL_MAX is unset', () => {
      delete process.env.DB_POOL_MAX;
      process.env.VERCEL = '1';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.DATA_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
      resetEnvCache();

      expect(getEnv().DB_POOL_MAX).toBe(2);
    });

    it('keeps explicit DB_POOL_MAX when VERCEL=1', () => {
      process.env.VERCEL = '1';
      process.env.DB_POOL_MAX = '4';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      process.env.DATA_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
      resetEnvCache();

      expect(getEnv().DB_POOL_MAX).toBe(4);
    });

    it('matches loopback HTTP origins for local dev and rejects non-loopback or HTTPS origins', () => {
      expect(isLocalDevOrigin('http://localhost:8082')).toBe(true);
      expect(isLocalDevOrigin('http://127.0.0.1:8082')).toBe(true);
      expect(isLocalDevOrigin('http://[::1]:8082')).toBe(true);

      expect(isLocalDevOrigin('https://evil.example.com')).toBe(false);
      expect(isLocalDevOrigin('http://localhost.evil.com:8082')).toBe(false);
      expect(isLocalDevOrigin('https://localhost:8082')).toBe(false);
    });

    it('rejects missing or invalid DATA_ENCRYPTION_KEY', () => {
      delete process.env.DATA_ENCRYPTION_KEY;
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      resetEnvCache();
      expect(() => getEnv()).toThrow(/DATA_ENCRYPTION_KEY/);

      process.env.DATA_ENCRYPTION_KEY = 'too-short-secret';
      resetEnvCache();
      expect(() => getEnv()).toThrow(/DATA_ENCRYPTION_KEY/);
    });
  });
});
