import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type User = {
  email: string;
  name?: string;
};

export type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, name?: string) => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'budget_tracker_auth_user';

function loadStoredUser(): User | null {
  try {
    const raw = globalThis.localStorage?.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).email === 'string' &&
      ((parsed as Record<string, unknown>).email as string).length > 0
    ) {
      const parsedRecord = parsed as Record<string, unknown>;
      return {
        email: parsedRecord.email as string,
        name: typeof parsedRecord.name === 'string' ? parsedRecord.name : undefined,
      };
    }
    return null;
  } catch (error: unknown) {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadStoredUser());

  const login = useCallback((email: string, name?: string) => {
    const nextUser: User = { email, name };
    setUser(nextUser);
    try {
      globalThis.localStorage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
    } catch (error: unknown) {
      // Storage unavailable or quota exceeded
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      globalThis.localStorage?.removeItem(AUTH_STORAGE_KEY);
    } catch (error: unknown) {
      // Storage unavailable
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: user !== null,
      login,
      logout,
    }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
