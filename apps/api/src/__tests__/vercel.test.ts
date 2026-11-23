import { afterEach, describe, expect, it } from 'vitest';
import {
  getEnv,
  getVercelDeploymentOrigins,
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
      resetEnvCache();

      expect(getEnv().DB_POOL_MAX).toBe(2);
    });

    it('keeps explicit DB_POOL_MAX when VERCEL=1', () => {
      process.env.VERCEL = '1';
      process.env.DB_POOL_MAX = '4';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      resetEnvCache();

      expect(getEnv().DB_POOL_MAX).toBe(4);
    });
  });
});
