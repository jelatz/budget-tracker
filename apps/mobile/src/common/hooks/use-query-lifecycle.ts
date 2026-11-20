import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

/**
 * Wires React Native's AppState lifecycle into TanStack Query's focusManager
 * so returning to the app on iOS/Android refetches stale balances and transactions.
 */
export function useQueryLifecycle(): void {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const handleAppStateChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);
}
