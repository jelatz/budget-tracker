import { z } from 'zod';
import {
  ApiError,
  apiFetch,
  getApiBaseUrl,
  setUnauthorizedHandler,
} from '../api-client';
import * as tokenStorage from '../token-storage';

jest.mock('../token-storage', () => ({
  getAccessToken: jest.fn(),
  setAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
}));

const mockedGetAccessToken = tokenStorage.getAccessToken as jest.MockedFunction<
  typeof tokenStorage.getAccessToken
>;

describe('api-client', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    setUnauthorizedHandler(null);
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_API_URL = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('normalizes EXPO_PUBLIC_API_URL and falls back to localhost:3000', () => {
    expect(getApiBaseUrl()).toBe('http://localhost:3000');

    process.env.EXPO_PUBLIC_API_URL = ' https://budget.example.com/// ';
    expect(getApiBaseUrl()).toBe('https://budget.example.com');
  });

  it('attaches Bearer token and parses response with Zod schema', async () => {
    mockedGetAccessToken.mockResolvedValue('tok-abc');
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const schema = z.object({ status: z.literal('ok') });
    const result = await apiFetch('/health', schema);

    expect(result).toEqual({ status: 'ok' });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok-abc');
  });

  it('invokes unauthorizedHandler and throws ApiError on 401', async () => {
    mockedGetAccessToken.mockResolvedValue('expired-tok');
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: 'Session expired' },
      }),
    }) as unknown as typeof fetch;

    await expect(
      apiFetch('/v1/wallets', z.array(z.unknown())),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Session expired',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('wraps network failures in ApiError with NETWORK_ERROR code', async () => {
    mockedGetAccessToken.mockResolvedValue(null);
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    try {
      await apiFetch('/v1/meta', z.object({ minSupportedVersion: z.string() }), {
        skipAuth: true,
      });
      throw new Error('Expected apiFetch to throw');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('NETWORK_ERROR');
      expect((error as ApiError).status).toBe(0);
    }
  });
});
