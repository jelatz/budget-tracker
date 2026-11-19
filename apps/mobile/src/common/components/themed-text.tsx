import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'defaultSemiBold'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
  lightColor?: string;
  darkColor?: string;
  className?: string;
};

const baseStyles = StyleSheet.create({
  small: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  smallBold: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  default: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  defaultSemiBold: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 36, fontWeight: '700', lineHeight: 42 },
  subtitle: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  link: { lineHeight: 24, fontSize: 14 },
  linkPrimary: { lineHeight: 24, fontSize: 14, color: '#3c87f7' },
  code: { fontFamily: Fonts.mono, fontWeight: '500', fontSize: 12 },
});

const typeClasses: Record<NonNullable<ThemedTextProps['type']>, string> = {
  small: 'text-sm leading-5 font-medium',
  smallBold: 'text-sm leading-5 font-bold',
  default: 'text-base leading-6 font-medium',
  defaultSemiBold: 'text-base leading-6 font-semibold',
  title: 'text-4xl leading-10 font-bold',
  subtitle: 'text-2xl leading-8 font-bold',
  link: 'text-sm leading-6',
  linkPrimary: 'text-sm leading-6 text-[#3c87f7]',
  code: 'text-xs font-mono font-medium',
};

const FONT_SIZE_REGEX = /(?:^|\s|(?:sm|md|lg|xl|2xl):)text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])(?=\s|$)/;
const LINE_HEIGHT_REGEX = /\bleading-[^\s]+\b/;
const FONT_WEIGHT_REGEX = /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;

function hasTextColorClass(className?: string): boolean {
  if (!className) return false;
  const tokens = className.split(/\s+/);
  return tokens.some((token) => {
    const raw = token.split(':').pop() || '';
    if (!raw.startsWith('text-')) return false;
    if (/^text-(xs|sm|base|lg|[1-9]xl|\[\d+(?:\.\d+)?(?:px|rem|em|pt|%)\])$/.test(raw)) return false;
    if (/^text-(left|center|right|justify|start|end)$/.test(raw)) return false;
    if (/^text-(wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(raw)) return false;
    return true;
  });
}

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  lightColor,
  darkColor,
  className,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const scheme = useColorScheme();

  const hasStyleColor = Boolean(
    (style && typeof style === 'object' && !Array.isArray(style) && 'color' in style) ||
      (Array.isArray(style) && style.some((s) => s && typeof s === 'object' && 'color' in s)) ||
      (StyleSheet.flatten(style)?.color !== undefined)
  );
  const hasTextColor = hasTextColorClass(className);
  const fallbackColor =
    (scheme === 'dark' ? darkColor : lightColor) ??
    (type === 'linkPrimary' && !themeColor ? undefined : theme[themeColor ?? 'text']);

  const colorStyle = hasTextColor || hasStyleColor || !fallbackColor ? undefined : { color: fallbackColor };

  let activeTypeClass: string;
  let activeBaseStyle: TextStyle | undefined;

  if (type === 'default') {
    const rawClass = className ?? '';
    const hasFontSize = FONT_SIZE_REGEX.test(rawClass);
    const hasLineHeight = LINE_HEIGHT_REGEX.test(rawClass);
    const hasFontWeight = FONT_WEIGHT_REGEX.test(rawClass);

    const defaultClassTokens: string[] = [];
    if (!hasFontSize) defaultClassTokens.push('text-base');
    if (!hasFontSize && !hasLineHeight) defaultClassTokens.push('leading-6');
    if (!hasFontWeight) defaultClassTokens.push('font-medium');
    activeTypeClass = defaultClassTokens.join(' ');

    const dynamicStyle: TextStyle = {
      ...(hasFontSize ? undefined : { fontSize: 16 }),
      ...(!hasFontSize && !hasLineHeight ? { lineHeight: 24 } : undefined),
      ...(hasFontWeight ? undefined : { fontWeight: '500' }),
    };

    activeBaseStyle = Object.keys(dynamicStyle).length > 0 ? dynamicStyle : undefined;
  } else {
    activeTypeClass = typeClasses[type];
    activeBaseStyle = baseStyles[type];
  }

  const combinedClassName = [activeTypeClass, className].filter(Boolean).join(' ');

  return (
    <Text
      className={combinedClassName}
      style={[activeBaseStyle, colorStyle, style]}
      {...rest}
    />
  );
}
