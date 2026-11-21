import {
  authSessionResponseSchema,
  loginInputSchema,
  logoutResponseSchema,
  meResponseSchema,
  registerInputSchema,
  type AuthSessionResponse,
  type LoginInput,
  type LogoutResponse,
  type MeResponse,
  type RegisterInput,
} from '@repo/contracts';
import { apiFetch } from '@/common/lib/api-client';

export async function registerApi(
  input: RegisterInput,
): Promise<AuthSessionResponse> {
  const payload = registerInputSchema.parse(input);
  return apiFetch('/v1/auth/register', authSessionResponseSchema, {
    method: 'POST',
    tokenOverride: null,
    body: JSON.stringify(payload),
  });
}

export async function loginApi(input: LoginInput): Promise<AuthSessionResponse> {
  const payload = loginInputSchema.parse(input);
  return apiFetch('/v1/auth/login', authSessionResponseSchema, {
    method: 'POST',
    tokenOverride: null,
    body: JSON.stringify(payload),
  });
}

export async function demoLoginApi(): Promise<AuthSessionResponse> {
  return apiFetch('/v1/auth/demo', authSessionResponseSchema, {
    method: 'POST',
    tokenOverride: null,
  });
}

export async function meApi(tokenOverride?: string | null): Promise<MeResponse> {
  return apiFetch('/v1/auth/me', meResponseSchema, {
    method: 'GET',
    ...(tokenOverride !== undefined ? { tokenOverride } : {}),
  });
}

export async function logoutApi(
  tokenOverride?: string | null,
): Promise<LogoutResponse> {
  return apiFetch('/v1/auth/logout', logoutResponseSchema, {
    method: 'POST',
    ...(tokenOverride !== undefined ? { tokenOverride } : {}),
  });
}
