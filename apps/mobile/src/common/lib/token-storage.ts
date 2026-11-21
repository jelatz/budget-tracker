import { authUserSchema, type AuthUser } from '@repo/contracts';
import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'budget_tracker_auth_token';
const AUTH_USER_KEY = 'budget_tracker_auth_user';

export interface AuthSnapshot {
  token: string | null;
  user: AuthUser | null;
}

export function getInitialAuthSnapshotSync(): AuthSnapshot | null {
  return null;
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch (error: unknown) {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } catch (error: unknown) {
    // Ignore secure store persistence failure
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch (error: unknown) {
    // Ignore secure store delete failure
  }
}

export async function getCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(AUTH_USER_KEY);
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
    await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(user));
  } catch (error: unknown) {
    // Ignore secure store persistence failure
  }
}

export async function clearCachedUser(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(AUTH_USER_KEY);
  } catch (error: unknown) {
    // Ignore secure store delete failure
  }
}
