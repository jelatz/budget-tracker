import { useEffect } from 'react';
import { router } from 'expo-router';

import { useAuth } from '@/features/auth/context/auth-context';

export function useRequireAuth() {
  const { isAuthenticated, isHydrating, user, logout } = useAuth();

  useEffect(() => {
    if (!isHydrating && !isAuthenticated) {
      router.replace('/');
    }
  }, [isHydrating, isAuthenticated]);

  return { isAuthenticated, isHydrating, user, logout };
}
