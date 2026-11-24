import '../global.css';

import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppTabs from '@/components/app-tabs';
import { FeedbackProvider } from '@/common/components/feedback-provider';
import { SyncCoordinator } from '@/common/components/sync-coordinator';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/common/hooks/use-color-scheme';
import { useWebAutoReload } from '@/common/hooks/use-web-auto-reload';
import { AuthProvider } from '@/features/auth/context/auth-context';

export { RouteErrorBoundary as ErrorBoundary } from '@/common/components/route-error-boundary';

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
  useWebAutoReload();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const mode = colorScheme === 'dark' ? 'dark' : 'light';
      document.documentElement.style.colorScheme = mode;
      if (mode === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [colorScheme]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !window.isSecureContext
    ) {
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((_error: unknown) => {
      // Ignore registration failures in restricted browser contexts (e.g. private browsing).
    });
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
