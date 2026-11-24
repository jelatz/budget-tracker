import { type ErrorBoundaryProps, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/common/hooks/use-theme';
import { ThemedText } from './themed-text';

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
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
