import React from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/context/auth-context';
import { ThemedText } from './themed-text';

function useTabTheme() {
  const theme = useTheme();
  const scheme = useColorScheme();
  return {
    ...theme,
    border:
      (theme as { border?: string }).border ??
      (scheme === 'dark' ? '#2E3135' : '#E0E1E6'),
  };
}

export interface MobileTabButtonProps
  extends Omit<TabTriggerSlotProps, 'children'> {
  children?: React.ReactNode;
  isPrimary?: boolean;
  ref?: React.Ref<View>;
}

export function MobileTabButton(props: MobileTabButtonProps) {
  const theme = useTabTheme();
  const {
    isFocused,
    children,
    isPrimary,
    style: _slotStyle,
    ref: _ref,
    href: _href,
    role: _role,
    ...pressableProps
  } = props as MobileTabButtonProps & { href?: string; role?: string };

  if (isPrimary) {
    return (
      <Pressable
        {...pressableProps}
        accessibilityRole="tab"
        accessibilityState={{ selected: Boolean(isFocused) }}
        className="flex-1 flex-col items-center justify-center min-h-[48px] px-0.5 relative"
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
        }}
      >
        <View
          className="rounded-xl px-2.5 py-2 items-center justify-center shadow-sm"
          style={{ backgroundColor: isFocused ? '#0066CC' : '#208AEF' }}
        >
          <ThemedText
            numberOfLines={1}
            className="text-[11px] font-bold text-white leading-tight"
          >
            {children}
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      className="flex-1 flex-col items-center justify-center min-h-[48px] px-0.5 relative"
      style={{
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
      }}
    >
      <View
        className="w-6 h-1 rounded-full mb-1"
        style={{ backgroundColor: isFocused ? '#208AEF' : 'transparent' }}
      />
      <ThemedText
        numberOfLines={1}
        className="text-[11px] text-center"
        style={{
          fontSize: 11,
          lineHeight: 14,
          fontWeight: isFocused ? '700' : '500',
          color: isFocused ? theme.text : theme.textSecondary,
        }}
      >
        {children}
      </ThemedText>
    </Pressable>
  );
}

export interface CustomMobileTabListProps extends TabListProps {
  ref?: React.Ref<View>;
}

export function CustomMobileTabList(props: CustomMobileTabListProps) {
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const theme = useTabTheme();

  const {
    children,
    style: _tabListStyle,
    ref: _ref,
    asChild: _asChild,
    ...viewProps
  } = props;

  if (!isAuthenticated) {
    return <View style={{ display: 'none' }}>{children}</View>;
  }

  return (
    <View
      {...viewProps}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        backgroundColor: theme.backgroundElement,
        borderTopColor: theme.border,
        borderTopWidth: 1,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
        paddingHorizontal: 4,
      }}
    >
      {children}
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs style={{ flex: 1, flexDirection: 'column' }}>
      <TabSlot style={{ flex: 1, width: '100%', height: '100%' }} />
      <TabList asChild>
        <CustomMobileTabList>
          <TabTrigger name="dashboard" href="/dashboard" asChild>
            <MobileTabButton>Overview</MobileTabButton>
          </TabTrigger>
          <TabTrigger name="transactions" href="/transactions" asChild>
            <MobileTabButton>Ledger</MobileTabButton>
          </TabTrigger>
          <TabTrigger name="capture" href="/capture" asChild>
            <MobileTabButton isPrimary>+ Capture</MobileTabButton>
          </TabTrigger>
          <TabTrigger name="reconciliation" href="/reconciliation" asChild>
            <MobileTabButton>Reconcile</MobileTabButton>
          </TabTrigger>
          <TabTrigger name="portability" href="/portability" asChild>
            <MobileTabButton>Backup</MobileTabButton>
          </TabTrigger>
          <TabTrigger name="index" href="/" style={{ display: 'none' }} />
          <TabTrigger name="register" href="/register" style={{ display: 'none' }} />
        </CustomMobileTabList>
      </TabList>
    </Tabs>
  );
}
