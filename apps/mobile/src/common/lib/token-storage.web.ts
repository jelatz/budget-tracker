import { authUserSchema, type AuthUser } from '@repo/contracts';

const LEGACY_AUTH_TOKEN_KEY = 'budget_tracker_auth_token';
const AUTH_USER_KEY = 'budget_tracker_auth_user';

export interface AuthSnapshot {
  token: string | null;
  user: AuthUser | null;
}

export function isCookieAuthMode(): boolean {
  return true;
}

function purgeLegacyLocalStorageToken(): void {
  try {
    globalThis.localStorage?.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch (error: unknown) {
    // Ignore localStorage failure
  }
}

export function getInitialAuthSnapshotSync(): AuthSnapshot | null {
  try {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
      return null;
    }
    purgeLegacyLocalStorageToken();
    const rawUser = globalThis.localStorage.getItem(AUTH_USER_KEY);
    let user: AuthUser | null = null;
    if (rawUser) {
      const parsed = authUserSchema.safeParse(JSON.parse(rawUser) as unknown);
      if (parsed.success) {
        user = parsed.data;
      }
    }
    return { token: null, user };
  } catch (error: unknown) {
    return null;
  }
}

export async function getAuthToken(): Promise<string | null> {
  purgeLegacyLocalStorageToken();
  return null;
}

export async function setAuthToken(_token: string): Promise<void> {
  // Web sessions authenticate via HttpOnly cookie; never persist bearer tokens in localStorage.
  purgeLegacyLocalStorageToken();
}

export async function clearAuthToken(): Promise<void> {
  purgeLegacyLocalStorageToken();
}

export async function getCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = globalThis.localStorage?.getItem(AUTH_USER_KEY);
    if (!raw) {
      return null;
    }
    const parsed = authUserSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch (error: unknown) {
    return null;
  }
}

export async function setCachedUser(user: AuthUser): Promise<void> {
  try {
    globalThis.localStorage?.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch (error: unknown) {
    // Ignore localStorage failure
  }
}

export async function clearCachedUser(): Promise<void> {
  try {
    globalThis.localStorage?.removeItem(AUTH_USER_KEY);
  } catch (error: unknown) {
    // Ignore localStorage failure
  }
}
