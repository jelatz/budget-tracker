import '../global.css';

import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppTabs from '@/components/app-tabs';
import { SyncCoordinator } from '@/common/components/sync-coordinator';
import { useWebAutoReload } from '@/common/hooks/use-web-auto-reload';
import { AuthProvider } from '@/features/auth/context/auth-context';

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
          <AppTabs />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
