const ACCESS_TOKEN_KEY = 'budget_tracker_access_token';

export async function getAccessToken(): Promise<string | null> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage.getItem(ACCESS_TOKEN_KEY);
    }
    return null;
  } catch (error: unknown) {
    return null;
  }
}

export async function setAccessToken(token: string): Promise<void> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    }
  } catch (error: unknown) {
    // Ignore storage errors
  }
}

export async function clearAccessToken(): Promise<void> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  } catch (error: unknown) {
    // Ignore storage errors
  }
}
