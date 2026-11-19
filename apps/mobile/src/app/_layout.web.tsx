import '../global.css';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/features/auth/context/auth-context';

export type WebThemeMode = 'system' | 'light' | 'dark';
export type WebResolvedScheme = 'light' | 'dark';

export interface WebThemeContextValue {
  themeMode: WebThemeMode;
  resolvedScheme: WebResolvedScheme;
  setThemeMode: (mode: WebThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'budget_tracker_web_theme_mode';

export const WebThemeContext = createContext<WebThemeContextValue | null>(null);

export function useWebThemeMode(): WebThemeContextValue {
  const context = useContext(WebThemeContext);
  if (!context) {
    return {
      themeMode: 'system',
      resolvedScheme: 'light',
      setThemeMode: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}

const getInitialThemeMode = (): WebThemeMode => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // Ignore storage access error
    }
  }
  return 'system';
};

export default function TabLayout() {
  const deviceScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<WebThemeMode>(getInitialThemeMode);

  const setThemeMode = useCallback((mode: WebThemeMode) => {
    setThemeModeState(mode);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Ignore
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      const currentResolved = prev === 'system' ? (deviceScheme === 'dark' ? 'dark' : 'light') : prev;
      const nextMode: WebThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(STORAGE_KEY, nextMode);
        } catch {
          // Ignore
        }
      }
      return nextMode;
    });
  }, [deviceScheme]);

  const resolvedScheme: WebResolvedScheme = useMemo(() => {
    if (themeMode === 'light') return 'light';
    if (themeMode === 'dark') return 'dark';
    return deviceScheme === 'dark' ? 'dark' : 'light';
  }, [themeMode, deviceScheme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const isDark = resolvedScheme === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      if (isDark) {
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.style.colorScheme = 'light';
      }
    }
  }, [resolvedScheme]);

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

  const contextValue = useMemo<WebThemeContextValue>(
    () => ({
      themeMode,
      resolvedScheme,
      setThemeMode,
      toggleTheme,
    }),
    [themeMode, resolvedScheme, setThemeMode, toggleTheme],
  );

  return (
    <WebThemeContext.Provider value={contextValue}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider value={resolvedScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AppTabs />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WebThemeContext.Provider>
  );
}
