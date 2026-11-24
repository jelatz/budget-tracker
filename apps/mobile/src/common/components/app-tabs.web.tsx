import { useState } from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
  type TabListProps,
} from 'expo-router/ui';
import { router, Slot } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DEFAULT_CURRENCY_SYMBOL } from '@repo/contracts';
import { useAuth } from '@/features/auth/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { AppIcon, type AppIconName } from './app-icon';
import { SyncStatusBadge } from './sync-status-badge';
import { ThemedText } from './themed-text';

export default function AppTabs() {
  const { isAuthenticated, logout } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDesktop = width >= 768;

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
        <Slot />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <Tabs
        key="auth-tabs"
        style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {!isDesktop && (
          <View className="h-14 px-3 flex-row items-center justify-between bg-ledger-surface dark:bg-ledger-surface-dark border-b border-ledger-border dark:border-ledger-border-dark z-30">
            <View className="flex-row items-center gap-2.5">
              <Pressable
                onPress={() => setDrawerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                className="w-11 h-11 rounded-xl items-center justify-center hover:bg-ledger-subtle dark:hover:bg-ledger-subtle-dark active:opacity-75">
                <AppIcon name="menu" size={20} color={theme.text} />
              </Pressable>
              <View className="w-7 h-7 rounded-lg bg-brand-500 dark:bg-brand-400 items-center justify-center">
                <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark text-sm font-bold leading-none">
                  {DEFAULT_CURRENCY_SYMBOL}
                </ThemedText>
              </View>
              <ThemedText className="text-sm font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark">
                Budget Tracker
              </ThemedText>
            </View>

            <View className="flex-row items-center gap-2">
              <SyncStatusBadge compact />
              <Pressable
                onPress={async () => {
                  setDrawerOpen(false);
                  await logout();
                  router.replace('/');
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign Out"
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                className="min-h-[36px] px-3 py-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75">
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Sign Out
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {!isDesktop && drawerOpen && (
          <Pressable
            onPress={() => setDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            className="absolute inset-0 z-40 bg-black/45"
          />
        )}

        <TabList asChild>
          <SidebarTabList
            isDesktop={isDesktop}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}>
            <TabTrigger name="dashboard" href="/dashboard" asChild>
              <SidebarNavItem
                icon="dashboard"
                label="Overview"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="accounts" href="/accounts" asChild>
              <SidebarNavItem
                icon="accounts"
                label="Accounts"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="expenses" href="/expenses" asChild>
              <SidebarNavItem
                icon="expenses"
                label="Expenses"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="capture" href="/capture" asChild>
              <SidebarNavItem
                icon="capture"
                label="Fast Entry"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="transactions" href="/transactions" asChild>
              <SidebarNavItem
                icon="history"
                label="History"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="reconciliation" href="/reconciliation" asChild>
              <SidebarNavItem
                icon="reconcile"
                label="Reconcile"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="portability" href="/portability" asChild>
              <SidebarNavItem
                icon="portability"
                label="Backup & Export"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
          </SidebarTabList>
        </TabList>

        <TabSlot style={{ flex: 1, minWidth: 0, height: '100%' }} />
      </Tabs>
    </View>
  );
}

type SidebarNavItemProps = TabTriggerSlotProps & {
  icon: AppIconName;
  label: string;
  onNavigate?: () => void;
};

export function SidebarNavItem({
  isFocused,
  icon,
  label,
  onNavigate,
  onPress,
  style,
  ...rest
}: SidebarNavItemProps) {
  const theme = useTheme();
  const { ref: _ref, ...pressableProps } = rest as Omit<
    SidebarNavItemProps,
    'isFocused' | 'icon' | 'label' | 'onNavigate' | 'onPress' | 'style'
  >;

  return (
    <Pressable
      {...pressableProps}
      onPress={(event) => {
        onPress?.(event);
        onNavigate?.();
      }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(isFocused) }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        { justifyContent: 'flex-start' },
      ]}
      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex-row items-center gap-3 ${
        isFocused
          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200/70 dark:border-ledger-border-dark'
          : 'border border-transparent hover:bg-ledger-selected/70 dark:hover:bg-ledger-selected-dark active:opacity-75'
      }`}>
      <AppIcon
        name={icon}
        size={18}
        color={isFocused ? theme.primary : theme.textSecondary}
      />
      <ThemedText
        className={`text-sm ${
          isFocused
            ? 'font-semibold text-brand-500 dark:text-brand-400'
            : 'font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
        }`}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type SidebarTabListProps = TabListProps & {
  isDesktop: boolean;
  isOpen: boolean;
  onClose: () => void;
};

export function SidebarTabList({
  style,
  children,
  isDesktop,
  isOpen,
  onClose,
  ...restProps
}: SidebarTabListProps) {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const avatarInitial = (user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();

  return (
    <View
      {...restProps}
      style={StyleSheet.flatten([
        style,
        isDesktop
          ? {
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: 248,
              flexShrink: 0,
              height: '100%',
            }
          : {
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: 268,
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 50,
              display: isOpen ? 'flex' : 'none',
            },
      ])}
      className="bg-ledger-subtle dark:bg-ledger-surface-dark border-r border-ledger-border dark:border-ledger-border-dark">
      {/* Brand Header */}
      <View className="px-4 pt-5 pb-4 border-b border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-9 h-9 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center shrink-0">
            <ThemedText className="text-ledger-canvas dark:text-ledger-canvas-dark text-lg font-bold leading-none">
              {DEFAULT_CURRENCY_SYMBOL}
            </ThemedText>
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
              Personal Ledger
            </ThemedText>
          </View>
        </View>

        {!isDesktop && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            className="w-11 h-11 rounded-xl items-center justify-center hover:bg-ledger-selected dark:hover:bg-ledger-selected-dark active:opacity-75">
            <AppIcon name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Navigation Links */}
      <View className="flex-1 px-3 py-4 gap-1">
        {children}
      </View>

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
          onPress={async () => {
            onClose();
            await logout();
            router.replace('/');
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-subtle-dark flex-row items-center justify-center gap-2 active:opacity-75">
          <AppIcon name="logout" size={16} color={theme.textSecondary} />
          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Sign Out
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
