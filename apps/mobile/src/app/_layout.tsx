import '../global.css';

import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppTabs from '@/components/app-tabs';
import { FeedbackProvider } from '@/common/components/feedback-provider';
import { SyncCoordinator } from '@/common/components/sync-coordinator';
import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/features/auth/context/auth-context';

export { RouteErrorBoundary as ErrorBoundary } from '@/common/components/route-error-boundary';

SplashScreen.preventAutoHideAsync();

const LedgerLightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.primary,
    background: Colors.light.background,
    card: Colors.light.surface,
    text: Colors.light.text,
    border: Colors.light.border,
    notification: Colors.light.negative,
  },
};

const LedgerDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.primary,
    background: Colors.dark.background,
    card: Colors.dark.surface,
    text: Colors.dark.text,
    border: Colors.dark.border,
    notification: Colors.dark.negative,
  },
};

export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? LedgerDarkTheme : LedgerLightTheme}>
          <FeedbackProvider>
            <SyncCoordinator />
            <AppTabs />
          </FeedbackProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
