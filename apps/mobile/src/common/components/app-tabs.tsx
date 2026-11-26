import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
  type TabListProps,
} from 'expo-router/ui';
import { router, Slot } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/context/auth-context';
import { QuickAddTransactionFab } from '@/features/transactions/components/quick-add-transaction-fab';
import { useTheme } from '@/hooks/use-theme';
import { AppIcon, type AppIconName } from './app-icon';
import { SyncStatusBadge } from './sync-status-badge';
import { ThemedText } from './themed-text';

export default function AppTabs() {
  const { isAuthenticated, logout } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 768;

  const handleSignOut = async () => {
    try {
      await logout();
      router.replace('/');
    } catch (_error: unknown) {
      router.replace('/');
    }
  };

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
        <Slot />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      {!isDesktop && (
        <SafeAreaView
          edges={['top', 'left', 'right']}
          className="bg-ledger-surface dark:bg-ledger-surface-dark border-b border-ledger-border dark:border-ledger-border-dark z-30">
          <View className="min-h-[52px] px-4 flex-row items-center justify-between gap-2">
            <View className="flex-row items-center gap-2 flex-1 min-w-0">
              <AppIcon name="wallet" size={18} color={theme.primary} />
              <ThemedText
                className="text-base font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark flex-1"
                numberOfLines={1}>
                Budget Tracker
              </ThemedText>
            </View>

            <View className="flex-row items-center gap-2 shrink-0">
              <SyncStatusBadge compact />
              <Pressable
                onPress={() => {
                  void handleSignOut();
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign Out"
                className="min-h-[44px] min-w-[44px] px-3 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75">
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Sign Out
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      )}

      <Tabs
        key="auth-tabs"
        style={{
          flex: 1,
          flexDirection: isDesktop ? 'row' : 'column-reverse',
        }}>
        <TabList asChild>
          <NavigationTabList isDesktop={isDesktop}>
            <TabTrigger name="dashboard" href="/dashboard" asChild>
              <NavTabItem
                label="Home"
                icon="dashboard"
                isDesktop={isDesktop}
              />
            </TabTrigger>
            <TabTrigger name="transactions" href="/transactions" asChild>
              <NavTabItem
                label="Spending"
                icon="expenses"
                isDesktop={isDesktop}
              />
            </TabTrigger>
            <TabTrigger name="debts" href="/debts" asChild>
              <NavTabItem
                label="Debts"
                icon="loan"
                isDesktop={isDesktop}
              />
            </TabTrigger>
            <TabTrigger name="accounts" href="/accounts" asChild>
              <NavTabItem
                label="Accounts"
                icon="accounts"
                isDesktop={isDesktop}
              />
            </TabTrigger>
          </NavigationTabList>
        </TabList>

        <TabSlot style={{ flex: 1, minWidth: 0, minHeight: 0 }} />
      </Tabs>

      <QuickAddTransactionFab />
    </View>
  );
}

type NavTabItemProps = TabTriggerSlotProps & {
  label: string;
  icon: AppIconName;
  isDesktop: boolean;
};

export function NavTabItem({
  isFocused,
  label,
  icon,
  isDesktop,
  onPress,
  style,
  ...rest
}: NavTabItemProps) {
  const theme = useTheme();
  const { ref: _ref, ...pressableProps } = rest as Omit<
    NavTabItemProps,
    'isFocused' | 'label' | 'icon' | 'isDesktop' | 'onPress' | 'style'
  >;

  const focused = Boolean(isFocused);
  const iconColor = focused ? theme.primary : theme.textSecondary;
  const slotStyle = typeof style === 'function' ? undefined : style;

  if (!isDesktop) {
    return (
      <Pressable
        {...pressableProps}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={StyleSheet.flatten([
          slotStyle,
          {
            flex: 1,
            flexBasis: 0,
            minWidth: 0,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ])}
        className={`flex-1 min-w-0 min-h-[52px] py-1.5 px-1.5 rounded-xl flex-col items-center justify-center gap-1 ${
          focused
            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft'
            : 'active:opacity-75'
        }`}>
        <AppIcon name={icon} size={20} color={iconColor} />
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          className={`text-[11px] text-center ${
            focused
              ? 'font-bold text-brand-500 dark:text-brand-400'
              : 'font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
          }`}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <Pressable
      {...pressableProps}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={StyleSheet.flatten([
        slotStyle,
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
        },
      ])}
      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex-row items-center justify-start gap-2.5 ${
        focused
          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200/70 dark:border-ledger-border-dark'
          : 'border border-transparent hover:bg-ledger-selected/70 dark:hover:bg-ledger-selected-dark active:opacity-75'
      }`}>
      <AppIcon name={icon} size={18} color={iconColor} />
      <ThemedText
        className={`text-sm ${
          focused
            ? 'font-semibold text-brand-500 dark:text-brand-400'
            : 'font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
        }`}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type NavigationTabListProps = TabListProps & {
  isDesktop: boolean;
};

export function NavigationTabList({
  style,
  children,
  isDesktop,
  ...restProps
}: NavigationTabListProps) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const avatarInitial = (user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();

  const handleSignOut = async () => {
    try {
      await logout();
      router.replace('/');
    } catch (_error: unknown) {
      router.replace('/');
    }
  };

  if (!isDesktop) {
    return (
      <View
        {...restProps}
        style={StyleSheet.flatten([
          style,
          {
            width: '100%',
            paddingBottom: Math.max(12, insets.bottom),
            paddingLeft: Math.max(12, insets.left + 12),
            paddingRight: Math.max(12, insets.right + 12),
            paddingTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          },
        ])}
        className="bg-ledger-surface dark:bg-ledger-surface-dark border-t border-ledger-border dark:border-ledger-border-dark z-20">
        {children}
      </View>
    );
  }

  return (
    <View
      {...restProps}
      style={StyleSheet.flatten([
        style,
        {
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 240,
          flexShrink: 0,
          height: '100%',
        },
      ])}
      className="bg-ledger-subtle dark:bg-ledger-surface-dark border-r border-ledger-border dark:border-ledger-border-dark">
      {/* Brand Header */}
      <View className="px-4 pt-5 pb-4 border-b border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2.5">
        <View className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center shrink-0">
          <AppIcon name="wallet" size={16} color={theme.primary} />
        </View>
        <View className="flex-1 min-w-0">
          <ThemedText
            className="text-sm font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
            numberOfLines={1}>
            Budget Tracker
          </ThemedText>
          <ThemedText
            className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
            numberOfLines={1}>
            Money & Debts
          </ThemedText>
        </View>
      </View>

      {/* Navigation Links */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16, gap: 4 }}>
        {children}
      </ScrollView>

      {/* Account & Sign Out Footer */}
      <View className="p-3 border-t border-ledger-border dark:border-ledger-border-dark gap-2.5">
        <View className="items-start">
          <SyncStatusBadge />
        </View>

        <View className="px-3 py-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center shrink-0">
            <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
              {avatarInitial}
            </ThemedText>
          </View>
          <View className="flex-1 min-w-0">
            <ThemedText
              className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
              numberOfLines={1}>
              {user?.name ?? 'Signed in'}
            </ThemedText>
            <ThemedText
              className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
              numberOfLines={1}>
              {user?.email ?? 'User'}
            </ThemedText>
          </View>
        </View>

        <Pressable
          onPress={() => {
            void handleSignOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-subtle-dark flex-row items-center justify-center gap-2 active:opacity-75">
          <AppIcon name="logout" size={14} color={theme.textSecondary} />
          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Sign Out
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
