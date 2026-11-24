import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, TABULAR_NUMS_STYLE, ThemeColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
  lightColor?: string;
  darkColor?: string;
  numeric?: boolean;
  className?: string;
};

const baseStyles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  default: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  title: { fontSize: 36, fontWeight: '700', lineHeight: 42 },
  subtitle: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  link: { lineHeight: 24, fontSize: 14 },
  linkPrimary: { lineHeight: 24, fontSize: 14 },
  code: { fontFamily: Fonts.mono, fontWeight: '500', fontSize: 12 },
});

const typeClasses: Record<NonNullable<ThemedTextProps['type']>, string> = {
  small: 'text-sm leading-5 font-medium',
  smallBold: 'text-sm leading-5 font-bold',
  default: 'text-base leading-6 font-medium',
  title: 'text-4xl leading-10 font-bold',
  subtitle: 'text-2xl leading-8 font-bold',
  link: 'text-sm leading-6',
  linkPrimary: 'text-sm leading-6 text-brand-500',
  code: 'text-xs font-mono font-medium',
};

function extractRawToken(token: string): string {
  return token.split(':').pop() || '';
}

function isFontSizeToken(raw: string): boolean {
  return /^text-(xs|sm|base|lg|[1-9]xl)$/.test(raw) || /^text-\[\d/.test(raw);
}

function isLineHeightToken(raw: string): boolean {
  return /^leading-/.test(raw);
}

function isFontWeightToken(raw: string): boolean {
  return /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(raw);
}

function isFontFamilyToken(raw: string): boolean {
  return /^font-(sans|serif|mono|rounded)$/.test(raw);
}

function isTextColorToken(raw: string): boolean {
  if (!raw.startsWith('text-')) return false;
  if (isFontSizeToken(raw)) return false;
  if (/^text-(left|center|right|justify|start|end)$/.test(raw)) return false;
  if (/^text-(wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(raw)) return false;
  return true;
}

function analyzeClassTokens(className?: string) {
  if (!className) {
    return {
      hasTextColor: false,
      hasFontSize: false,
      hasLineHeight: false,
      hasFontWeight: false,
      hasFontFamily: false,
    };
  }

  let hasTextColor = false;
  let hasFontSize = false;
  let hasLineHeight = false;
  let hasFontWeight = false;
  let hasFontFamily = false;

  for (const token of className.split(/\s+/)) {
    if (!token) continue;
    const raw = extractRawToken(token);
    if (isFontSizeToken(raw)) hasFontSize = true;
    if (isLineHeightToken(raw)) hasLineHeight = true;
    if (isFontWeightToken(raw)) hasFontWeight = true;
    if (isFontFamilyToken(raw)) hasFontFamily = true;
    if (isTextColorToken(raw)) hasTextColor = true;
  }

  return {
    hasTextColor,
    hasFontSize,
    hasLineHeight,
    hasFontWeight,
    hasFontFamily,
  };
}

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  lightColor,
  darkColor,
  numeric = false,
  className,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  const overrides = analyzeClassTokens(className);

  const fallbackColor =
    (scheme === 'dark' ? darkColor : lightColor) ??
    (type === 'linkPrimary' && !themeColor ? undefined : theme[themeColor ?? 'text']);

  const colorStyle =
    overrides.hasTextColor || !fallbackColor ? undefined : { color: fallbackColor };

  const filteredTypeClasses = typeClasses[type]
    .split(/\s+/)
    .filter((token) => {
      if ((overrides.hasFontSize || overrides.hasLineHeight) && (isFontSizeToken(token) || isLineHeightToken(token))) {
        return false;
      }
      if (overrides.hasFontWeight && isFontWeightToken(token)) {
        return false;
      }
      if (overrides.hasFontFamily && isFontFamilyToken(token)) {
        return false;
      }
      if (overrides.hasTextColor && isTextColorToken(token)) {
        return false;
      }
      return true;
    })
    .join(' ');

  const rawBaseStyle = StyleSheet.flatten(baseStyles[type]) as TextStyle;
  const resolvedBaseStyle: TextStyle = {
    ...(!(overrides.hasFontSize || overrides.hasLineHeight) && rawBaseStyle.fontSize !== undefined
      ? { fontSize: rawBaseStyle.fontSize }
      : {}),
    ...(!(overrides.hasFontSize || overrides.hasLineHeight) && rawBaseStyle.lineHeight !== undefined
      ? { lineHeight: rawBaseStyle.lineHeight }
      : {}),
    ...(!overrides.hasFontWeight && rawBaseStyle.fontWeight !== undefined
      ? { fontWeight: rawBaseStyle.fontWeight }
      : {}),
    ...(!overrides.hasFontFamily && rawBaseStyle.fontFamily !== undefined
      ? { fontFamily: rawBaseStyle.fontFamily }
      : {}),
  };

  const combinedClassName = [filteredTypeClasses, className].filter(Boolean).join(' ');
  const hasResolvedBaseStyle = Object.keys(resolvedBaseStyle).length > 0;
  const mergedStyle =
    hasResolvedBaseStyle || colorStyle || numeric || style
      ? StyleSheet.flatten([
          hasResolvedBaseStyle ? resolvedBaseStyle : undefined,
          colorStyle,
          numeric ? TABULAR_NUMS_STYLE : undefined,
          style,
        ])
      : undefined;

  return (
    <Text
      className={combinedClassName}
      style={mergedStyle}
      {...rest}
    />
  );
}
