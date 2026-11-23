import '../global.css';

import { useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SyncCoordinator } from '@/common/components/sync-coordinator';
import { AuthProvider } from '@/features/auth/context/auth-context';

export { RouteErrorBoundary as ErrorBoundary } from '@/common/components/route-error-boundary';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

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
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SyncCoordinator />
          <AnimatedSplashOverlay />
          <AppTabs />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
