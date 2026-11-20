import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import {
  applyPlatformTheme,
  loadThemeModeAsync,
  saveThemeMode,
} from '../theme-storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('nativewind', () => ({
  colorScheme: {
    set: jest.fn(),
  },
}));

describe('theme-storage (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads valid stored theme modes and defaults unknown values to system', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('dark');
    expect(await loadThemeModeAsync()).toBe('dark');

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('invalid');
    expect(await loadThemeModeAsync()).toBe('system');
  });

  it('persists theme mode to SecureStore', async () => {
    await saveThemeMode('light');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'budget_tracker_theme_mode',
      'light',
    );
  });

  it('applies RN 0.88 Appearance override and NativeWind colorScheme', () => {
    const spy = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});

    applyPlatformTheme('system', 'light');
    expect(spy).toHaveBeenCalledWith('unspecified');
    expect(nativewindColorScheme.set).toHaveBeenCalledWith('system');

    applyPlatformTheme('dark', 'dark');
    expect(spy).toHaveBeenCalledWith('dark');
    expect(nativewindColorScheme.set).toHaveBeenCalledWith('dark');

    spy.mockRestore();
  });
});
