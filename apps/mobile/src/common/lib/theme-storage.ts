import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colorScheme as nativewindColorScheme } from 'nativewind';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

const THEME_MODE_KEY = 'budget_tracker_theme_mode';

export function loadThemeModeSync(): ThemeMode {
  return 'system';
}

export async function loadThemeModeAsync(): Promise<ThemeMode> {
  try {
    const stored = await SecureStore.getItemAsync(THEME_MODE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (error: unknown) {
    // Ignore secure store read errors
  }
  return 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_MODE_KEY, mode);
  } catch (error: unknown) {
    // Ignore secure store write errors
  }
}

export function applyPlatformTheme(
  mode: ThemeMode,
  _resolved: ResolvedScheme,
): void {
  try {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  } catch (error: unknown) {
    // Ignore Appearance API errors on unsupported runtimes
  }
  try {
    nativewindColorScheme.set(mode);
  } catch (error: unknown) {
    // Ignore NativeWind colorScheme sync errors
  }
}
