import '../global.css';

import { useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { VersionGate } from '@/common/components/version-gate';
import {
  ThemeModeProvider,
  useThemeMode,
} from '@/common/context/theme-mode-context';
import { useQueryLifecycle } from '@/common/hooks/use-query-lifecycle';
import { AuthProvider } from '@/features/auth/context/auth-context';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { resolvedScheme } = useThemeMode();
  return (
    <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <VersionGate>
        <AppTabs />
      </VersionGate>
    </ThemeProvider>
  );
}

export default function TabLayout() {
  useQueryLifecycle();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 15,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeModeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeModeProvider>
  );
}
