import '../global.css';

import { useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppTabs from '@/components/app-tabs';
import { VersionGate } from '@/common/components/version-gate';
import {
  ThemeModeProvider,
  useThemeMode,
  type ResolvedScheme,
  type ThemeMode,
  type ThemeModeContextValue,
} from '@/common/context/theme-mode-context';
import { AuthProvider } from '@/features/auth/context/auth-context';

export type WebThemeMode = ThemeMode;
export type WebResolvedScheme = ResolvedScheme;
export type WebThemeContextValue = ThemeModeContextValue;
export const useWebThemeMode = useThemeMode;

function WebAppShell() {
  const { resolvedScheme } = useThemeMode();
  return (
    <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <VersionGate>
        <AppTabs />
      </VersionGate>
    </ThemeProvider>
  );
}

export default function TabLayout() {
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
          <WebAppShell />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeModeProvider>
  );
}
