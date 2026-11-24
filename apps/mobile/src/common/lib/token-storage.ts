import { authUserSchema, type AuthUser } from '@repo/contracts';
import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'budget_tracker_auth_token';
const AUTH_USER_KEY = 'budget_tracker_auth_user';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface AuthSnapshot {
  token: string | null;
  user: AuthUser | null;
}

export function isCookieAuthMode(): boolean {
  return false;
}

export function getInitialAuthSnapshotSync(): AuthSnapshot | null {
  return null;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  } catch (error: unknown) {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token, SECURE_STORE_OPTIONS);
  } catch (error: unknown) {
    // Ignore secure store persistence failure
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY, SECURE_STORE_OPTIONS);
  } catch (error: unknown) {
    // Ignore secure store delete failure
  }
}

export async function getCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(AUTH_USER_KEY, SECURE_STORE_OPTIONS);
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
    await SecureStore.setItemAsync(
      AUTH_USER_KEY,
      JSON.stringify(user),
      SECURE_STORE_OPTIONS,
    );
  } catch (error: unknown) {
    // Ignore secure store persistence failure
  }
}

export async function clearCachedUser(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_USER_KEY, SECURE_STORE_OPTIONS);
  } catch (error: unknown) {
    // Ignore secure store delete failure
  }
}
