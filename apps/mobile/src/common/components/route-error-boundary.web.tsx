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
      <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
        <SafeAreaView
          style={{ flex: 1 }}
          edges={['top', 'bottom', 'left', 'right']}
          className="flex-1 items-center justify-center px-6"
        >
          <View className="items-center gap-3">
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText className="text-sm font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
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
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView
        style={{ flex: 1 }}
        edges={['top', 'bottom', 'left', 'right']}
        className="flex-1 items-center justify-center px-6"
      >
        <View className="w-full max-w-[420px] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-6 gap-4">
          <View className="gap-1.5">
            <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
              Something went wrong
            </ThemedText>
            <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center leading-5">
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
              className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 items-center justify-center"
            >
              <ThemedText
                className="text-sm font-bold"
                style={{ color: theme.onPrimary }}
              >
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
              className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Reload Page
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                router.replace('/dashboard');
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to Dashboard"
              className="w-full min-h-[44px] px-4 py-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Go to Dashboard
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
