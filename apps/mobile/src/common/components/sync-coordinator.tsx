import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVersionGate } from '@/common/hooks/use-version-gate';
import { subscribeSyncLifecycle } from '@/common/lib/sync-lifecycle';
import { useAuth } from '@/features/auth/context/auth-context';
import { TRANSACTION_KEYS } from '@/features/transactions/hooks/use-transactions';
import { registerSyncHandlers, syncNow } from '@/features/transactions/sync-engine';
import { ThemedText } from './themed-text';

const FOREGROUND_SYNC_INTERVAL_MS = 30_000;

export function SyncCoordinator() {
  const queryClient = useQueryClient();
  const { isAuthenticated, logout } = useAuth();
  const versionStatus = useVersionGate();

  useEffect(() => {
    return registerSyncHandlers({
      onRemoteStateUpdated: () => {
        void queryClient.invalidateQueries({ queryKey: TRANSACTION_KEYS.all });
      },
      onUnauthorized: () => {
        void logout();
      },
    });
  }, [logout, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const unsubscribeLifecycle = subscribeSyncLifecycle(() => {
      void syncNow();
    });

    const intervalId = setInterval(() => {
      void syncNow();
    }, FOREGROUND_SYNC_INTERVAL_MS);

    return () => {
      unsubscribeLifecycle();
      clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  if (versionStatus !== 'update-required') {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      className="absolute inset-0 z-50 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        className="flex-1 items-center justify-center px-6">
        <View className="w-full max-w-[400px] rounded-3xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 p-6 gap-3 shadow-lg">
          <ThemedText className="text-lg font-extrabold text-slate-900 dark:text-white text-center">
            Update Required
          </ThemedText>
          <ThemedText className="text-sm text-slate-600 dark:text-slate-300 text-center leading-5">
            This version of Budget Tracker is no longer supported by the sync API. Please update the app to continue syncing safely.
          </ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}
