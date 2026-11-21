import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
  className?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  type,
  className,
  ...otherProps
}: ThemedViewProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  const hasBgClass = Boolean(className && /\bbg-/.test(className));
  const fallbackColor =
    (scheme === 'dark' ? darkColor : lightColor) ?? theme[type ?? 'background'];
  const bgStyle = hasBgClass ? undefined : { backgroundColor: fallbackColor };
  const mergedStyle =
    bgStyle || style ? StyleSheet.flatten([bgStyle, style]) : undefined;

  return (
    <View
      className={className}
      style={mergedStyle}
      {...otherProps}
    />
  );
}
