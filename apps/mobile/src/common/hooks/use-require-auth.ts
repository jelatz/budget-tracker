import { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';

import { useAuth } from '@/features/auth/context/auth-context';

export function useRequireAuth() {
  const { isAuthenticated, isHydrating, user, logout } = useAuth();
  const rootNavigationState = useRootNavigationState();
  const isNavigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    if (isNavigationReady && !isHydrating && !isAuthenticated) {
      router.replace('/');
    }
  }, [isNavigationReady, isHydrating, isAuthenticated]);

  return {
    isAuthenticated: isNavigationReady && !isHydrating && isAuthenticated,
    isHydrating,
    user,
    logout,
  };
}
