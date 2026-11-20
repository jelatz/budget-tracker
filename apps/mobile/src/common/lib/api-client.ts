import type { z } from 'zod';
import { getAccessToken } from './token-storage';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export function getApiBaseUrl(): string {
  // Dot notation required so Expo statically inlines EXPO_PUBLIC_API_URL
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const base = configured && configured.trim().length > 0
    ? configured.trim()
    : 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

async function extractErrorPayload(
  res: Response,
  path: string,
): Promise<{ code: string; message: string }> {
  try {
    const raw: unknown = await res.json();
    if (
      raw &&
      typeof raw === 'object' &&
      'error' in raw &&
      raw.error &&
      typeof raw.error === 'object'
    ) {
      const errObj = raw.error as Record<string, unknown>;
      const code = typeof errObj.code === 'string' ? errObj.code : 'HTTP_ERROR';
      const message =
        typeof errObj.message === 'string'
          ? errObj.message
          : `Request failed (${res.status}) for ${path}`;
      return { code, message };
    }
  } catch (error: unknown) {
    // Non-JSON error body
  }
  return {
    code: 'HTTP_ERROR',
    message: `Request failed (${res.status}) for ${path}`,
  };
}

/**
 * Typed HTTP client calling `@repo/api` and validating every response against `@repo/contracts`.
 */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: ApiFetchOptions,
): Promise<T> {
  const { skipAuth = false, headers: customHeaders, ...fetchInit } = init ?? {};
  const baseUrl = getApiBaseUrl();
  const headers = new Headers(customHeaders);

  if (fetchInit.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = await getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...fetchInit,
      headers,
    });
  } catch (error: unknown) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error
        ? `Unable to reach server: ${error.message}`
        : 'Unable to reach server',
    );
  }

  if (!res.ok) {
    const { code, message } = await extractErrorPayload(res, path);
    if (res.status === 401 && !skipAuth) {
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, code, message);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}
