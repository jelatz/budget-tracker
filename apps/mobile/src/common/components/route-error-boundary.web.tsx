import { type ErrorBoundaryProps, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/common/hooks/use-theme';
import { ThemedText } from './themed-text';

const CHUNK_RELOAD_AT_KEY = 'budget_tracker_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

export function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) {
    return false;
  }
  if (error.name === 'AsyncRequireError') {
    return true;
  }
  const message = error.message ?? '';
  return (
    /Loading module .* failed/i.test(message) ||
    /Chunk .* did not finish registering/i.test(message) ||
    /Requiring unknown module/i.test(message) ||
    /Loading chunk .* failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Unexpected token ['"]?</i.test(message)
  );
}

function canAutoReload(error: Error | null | undefined): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) {
    return false;
  }
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_AT_KEY);
    if (raw) {
      const lastAt = Number(raw);
      if (Number.isFinite(lastAt) && Date.now() - lastAt < CHUNK_RELOAD_COOLDOWN_MS) {
        return false;
      }
    }
    return true;
  } catch (storageError: unknown) {
    return false;
  }
}

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  const [isReloading, setIsReloading] = useState<boolean>(() => canAutoReload(error));

  useEffect(() => {
    if (!canAutoReload(error)) {
      setIsReloading(false);
      return;
    }

    setIsReloading(true);
    try {
      window.sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(Date.now()));
    } catch (storageError: unknown) {
      // Ignore restricted storage environments.
    }
    window.location.reload();
  }, [error]);

  if (isReloading) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950">
        <SafeAreaView
          style={{ flex: 1 }}
          edges={['top', 'bottom', 'left', 'right']}
          className="flex-1 items-center justify-center px-6"
        >
          <View className="items-center gap-3">
            <ActivityIndicator size="large" color={theme.text} />
            <ThemedText className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">
              Updating to latest version…
            </ThemedText>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const message =
    error?.message && error.message.trim().length > 0
      ? error.message
      : 'An unexpected error occurred.';

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView
        style={{ flex: 1 }}
        edges={['top', 'bottom', 'left', 'right']}
        className="flex-1 items-center justify-center px-6"
      >
        <View className="w-full max-w-[420px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 gap-4 shadow-lg">
          <View className="gap-1.5">
            <ThemedText className="text-lg font-extrabold text-slate-900 dark:text-white text-center">
              Something went wrong
            </ThemedText>
            <ThemedText className="text-sm text-slate-600 dark:text-slate-300 text-center leading-5">
              {message}
            </ThemedText>
          </View>

          <View className="gap-2.5 pt-1">
            <Pressable
              onPress={() => {
                void retry();
              }}
              accessibilityRole="button"
              accessibilityLabel="Try Again"
              className="w-full min-h-[44px] px-4 py-3 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
            >
              <ThemedText className="text-sm font-bold text-white">
                Try Again
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Reload Page"
              className="w-full min-h-[44px] px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Reload Page
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                router.replace('/dashboard');
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to Dashboard"
              className="w-full min-h-[44px] px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Go to Dashboard
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
