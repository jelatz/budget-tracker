import { type ErrorBoundaryProps, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
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
