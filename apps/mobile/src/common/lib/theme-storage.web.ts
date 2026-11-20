export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

const THEME_MODE_KEY = 'budget_tracker_web_theme_mode';

export function loadThemeModeSync(): ThemeMode {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(THEME_MODE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch (error: unknown) {
      // Ignore storage access errors
    }
  }
  return 'system';
}

export async function loadThemeModeAsync(): Promise<ThemeMode> {
  return loadThemeModeSync();
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(THEME_MODE_KEY, mode);
    } catch (error: unknown) {
      // Ignore storage write errors
    }
  }
}

export function applyPlatformTheme(
  _mode: ThemeMode,
  resolved: ResolvedScheme,
): void {
  if (typeof document !== 'undefined') {
    const isDark = resolved === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }
}
