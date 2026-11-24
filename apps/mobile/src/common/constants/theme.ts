/**
 * Warm Editorial Ledger design tokens for light and dark themes.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1B18',
    textSecondary: '#5C584F',
    textMuted: '#8A8478',
    background: '#FAF8F4',
    surface: '#FFFFFF',
    backgroundElement: '#F3F0EA',
    backgroundSelected: '#E9E4DA',
    border: '#E5E0D6',
    borderStrong: '#CFC8BA',
    primary: '#1B4332',
    onPrimary: '#FAF8F4',
    primarySoft: '#EAF2EE',
    positive: '#1E6F4E',
    positiveSoft: '#EBF5F0',
    negative: '#B4432C',
    negativeSoft: '#FDF1EE',
    warning: '#A16207',
    warningSoft: '#FEF8EC',
    info: '#2C5F6E',
    infoSoft: '#EDF5F7',
  },
  dark: {
    text: '#F4F1EA',
    textSecondary: '#ABA599',
    textMuted: '#787368',
    background: '#131210',
    surface: '#1B1A17',
    backgroundElement: '#24221E',
    backgroundSelected: '#2F2C26',
    border: '#2E2B25',
    borderStrong: '#454037',
    primary: '#52B788',
    onPrimary: '#0B1A12',
    primarySoft: '#162B21',
    positive: '#52B788',
    positiveSoft: '#152820',
    negative: '#E07A5F',
    negativeSoft: '#2E1B16',
    warning: '#E0A458',
    warningSoft: '#2B2214',
    info: '#76B4C4',
    infoSoft: '#16252A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const TABULAR_NUMS_STYLE = {
  fontVariant: ['tabular-nums'] as const,
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
export const WebMaxPageWidth = 1152;
