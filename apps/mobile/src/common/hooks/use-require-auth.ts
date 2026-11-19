import { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';

import { useAuth } from '@/features/auth/context/auth-context';

export function useRequireAuth() {
  const { isAuthenticated, user, logout } = useAuth();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    if (isNavigationReady && !isAuthenticated) {
      router.replace('/');
    }
  }, [isNavigationReady, isAuthenticated]);

  return { isAuthenticated: isNavigationReady && isAuthenticated, user, logout };
}
