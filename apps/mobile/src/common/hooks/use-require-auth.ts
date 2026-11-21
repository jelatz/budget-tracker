import { useEffect } from 'react';
import { router } from 'expo-router';

import { useAuth } from '@/features/auth/context/auth-context';

export function useRequireAuth() {
  const { isAuthenticated, user, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated]);

  return { isAuthenticated, user, logout };
}
