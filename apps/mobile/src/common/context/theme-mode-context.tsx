import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import {
  applyPlatformTheme,
  loadThemeModeAsync,
  loadThemeModeSync,
  saveThemeMode,
  type ResolvedScheme,
  type ThemeMode,
} from '@/common/lib/theme-storage';

export type { ResolvedScheme, ThemeMode };

export interface ThemeModeContextValue {
  themeMode: ThemeMode;
  resolvedScheme: ResolvedScheme;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
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

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(loadThemeModeSync);

  useEffect(() => {
    let active = true;
    void loadThemeModeAsync().then((stored) => {
      if (active) {
        setThemeModeState(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    void saveThemeMode(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      const currentResolved: ResolvedScheme =
        prev === 'system'
          ? deviceScheme === 'dark'
            ? 'dark'
            : 'light'
          : prev;
      const nextMode: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      void saveThemeMode(nextMode);
      return nextMode;
    });
  }, [deviceScheme]);

  const resolvedScheme: ResolvedScheme = useMemo(() => {
    if (themeMode === 'light') return 'light';
    if (themeMode === 'dark') return 'dark';
    return deviceScheme === 'dark' ? 'dark' : 'light';
  }, [themeMode, deviceScheme]);

  useEffect(() => {
    applyPlatformTheme(themeMode, resolvedScheme);
  }, [themeMode, resolvedScheme]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      themeMode,
      resolvedScheme,
      setThemeMode,
      toggleTheme,
    }),
    [themeMode, resolvedScheme, setThemeMode, toggleTheme],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}
