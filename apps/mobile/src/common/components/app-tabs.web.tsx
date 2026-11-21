import { useState } from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { DEFAULT_CURRENCY_SYMBOL } from '@repo/contracts';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { ExternalLink } from './external-link';
import { SyncStatusBadge } from './sync-status-badge';
import { ThemedText } from './themed-text';

type SidebarIconName =
  | 'space_dashboard'
  | 'account_balance_wallet'
  | 'payments'
  | 'add_circle'
  | 'receipt_long'
  | 'balance'
  | 'backup';

export default function AppTabs() {
  const { isAuthenticated, logout } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isDesktop = width >= 768;

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950">
        <Tabs key="guest-tabs">
          <TabSlot style={{ height: '100%', paddingTop: 64 }} />
          <TabList asChild>
            <CustomTabList>
              <TabTrigger name="home" href="/" asChild>
                <TabButton>Login</TabButton>
              </TabTrigger>
              <TabTrigger name="register" href="/register" asChild>
                <TabButton>Register</TabButton>
              </TabTrigger>
            </CustomTabList>
          </TabList>
        </Tabs>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <Tabs
        key="auth-tabs"
        style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {!isDesktop && (
          <View className="h-14 px-3 flex-row items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 z-30">
            <View className="flex-row items-center gap-2.5">
              <Pressable
                onPress={() => setDrawerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open navigation menu"
                className="w-11 h-11 rounded-xl items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 active:opacity-75">
                <SymbolView
                  name={{ web: 'menu' }}
                  size={22}
                  tintColor={theme.text}
                />
              </Pressable>
              <View className="w-7 h-7 rounded-lg bg-brand-500 items-center justify-center shadow-sm shadow-brand-500/25">
                <ThemedText className="text-white text-sm font-bold leading-none">
                  {DEFAULT_CURRENCY_SYMBOL}
                </ThemedText>
              </View>
              <ThemedText className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
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
                className="px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 active:opacity-75">
                <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
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
            className="absolute inset-0 z-40 bg-slate-950/50"
          />
        )}

        <TabList asChild>
          <SidebarTabList
            isDesktop={isDesktop}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}>
            <TabTrigger name="dashboard" href="/dashboard" asChild>
              <SidebarNavItem
                icon="space_dashboard"
                label="Dashboard"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="accounts" href="/accounts" asChild>
              <SidebarNavItem
                icon="account_balance_wallet"
                label="Accounts"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="expenses" href="/expenses" asChild>
              <SidebarNavItem
                icon="payments"
                label="Expenses"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="capture" href="/capture" asChild>
              <SidebarNavItem
                icon="add_circle"
                label="Fast Entry"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="transactions" href="/transactions" asChild>
              <SidebarNavItem
                icon="receipt_long"
                label="History"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="reconciliation" href="/reconciliation" asChild>
              <SidebarNavItem
                icon="balance"
                label="Reconcile"
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="portability" href="/portability" asChild>
              <SidebarNavItem
                icon="backup"
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
  icon: SidebarIconName;
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
      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex-row items-center gap-3 transition-colors ${
        isFocused
          ? 'bg-brand-500 shadow-sm shadow-brand-500/25'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 active:opacity-75'
      }`}>
      <SymbolView
        name={{ web: icon }}
        size={18}
        tintColor={isFocused ? Colors.dark.text : theme.textSecondary}
      />
      <ThemedText
        className={`text-sm ${
          isFocused
            ? 'font-semibold text-white'
            : 'font-medium text-slate-700 dark:text-slate-300'
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
              width: 256,
              flexShrink: 0,
              height: '100%',
            }
          : {
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: 272,
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 50,
              display: isOpen ? 'flex' : 'none',
            },
      ])}
      className={`bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 ${
        !isDesktop ? 'shadow-2xl' : ''
      }`}>
      {/* Top Brand Header */}
      <View className="px-4 pt-5 pb-4 border-b border-slate-200/70 dark:border-slate-800 flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-9 h-9 rounded-xl bg-brand-500 items-center justify-center shadow-sm shadow-brand-500/30 shrink-0">
            <ThemedText className="text-white text-lg font-bold leading-none">
              {DEFAULT_CURRENCY_SYMBOL}
            </ThemedText>
          </View>
          <View className="flex-1 min-w-0">
            <ThemedText
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              numberOfLines={1}>
              Budget Tracker
            </ThemedText>
            <ThemedText
              className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500"
              numberOfLines={1}>
              FINTECH WORKSPACE
            </ThemedText>
          </View>
        </View>

        {!isDesktop && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            className="w-11 h-11 rounded-xl items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 active:opacity-75">
            <SymbolView
              name={{ web: 'close' }}
              size={20}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        )}
      </View>

      {/* Navigation Links */}
      <View className="flex-1 px-3 py-4 gap-1.5">
        <ThemedText className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          WORKSPACE
        </ThemedText>
        {children}
      </View>

      {/* Account & Sign Out Footer */}
      <View className="p-3 border-t border-slate-200/70 dark:border-slate-800 gap-2.5">
        <View className="items-start">
          <SyncStatusBadge />
        </View>
        <View className="px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-full bg-brand-500/15 border border-brand-500/30 items-center justify-center shrink-0">
            <ThemedText className="text-xs font-bold text-brand-600 dark:text-brand-400">
              {avatarInitial}
            </ThemedText>
          </View>
          <View className="flex-1 min-w-0">
            <ThemedText
              className="text-xs font-semibold text-slate-900 dark:text-slate-100"
              numberOfLines={1}>
              {user?.name ?? 'Signed in'}
            </ThemedText>
            <ThemedText
              className="text-[11px] text-slate-500 dark:text-slate-400"
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
          className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/70 dark:border-rose-900/50 flex-row items-center justify-center gap-2 active:opacity-75">
          <SymbolView
            name={{ web: 'logout' }}
            size={16}
            tintColor={theme.textSecondary}
          />
          <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            Sign Out
          </ThemedText>
        </Pressable>

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Expo Documentation"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            className="flex-row items-center justify-center gap-1.5 py-1.5 active:opacity-70">
            <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Docs
            </ThemedText>
            <SymbolView
              tintColor={theme.textSecondary}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </View>
    </View>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const { ref: _ref, ...pressableProps } = props as Omit<
    TabTriggerSlotProps,
    'children' | 'isFocused'
  >;
  return (
    <Pressable
      {...pressableProps}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      className="rounded-full active:opacity-75">
      <View
        className={`px-3 py-1.5 rounded-full flex-row items-center justify-center transition-colors ${
          isFocused
            ? 'bg-brand-500 shadow-sm'
            : 'bg-zinc-100/70 hover:bg-zinc-200/70 dark:bg-zinc-800/60 dark:hover:bg-zinc-700/60'
        }`}>
        <ThemedText
          className={`text-xs font-semibold ${
            isFocused ? 'text-white' : 'text-zinc-600 dark:text-zinc-300'
          }`}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList({ style, children, ...restProps }: TabListProps) {
  const theme = useTheme();

  return (
    <View
      {...restProps}
      style={[style, { justifyContent: 'center' }]}
      className="absolute top-0 left-0 right-0 z-50 w-full flex-row justify-center items-center p-3">
      <View className="mx-auto flex-row items-center w-full max-w-[800px] px-4 py-2 rounded-full bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-zinc-200/60 dark:border-zinc-800/80 shadow-md shadow-black/5 gap-2">
        <View className="flex-row items-center gap-2 mr-auto pl-1">
          <View className="w-2.5 h-2.5 rounded-full bg-brand-500 shadow-sm shadow-brand-500/50" />
          <ThemedText className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Budget Tracker
          </ThemedText>
        </View>

        {children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Expo Documentation"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            className="flex-row items-center gap-1.5 ml-2 pl-3 border-l border-zinc-200 dark:border-zinc-800 py-1 active:opacity-70">
            <ThemedText className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              Docs
            </ThemedText>
            <SymbolView
              tintColor={theme.textSecondary}
              name={{ ios: 'arrow.up.right.square', web: 'link' }}
              size={12}
            />
          </Pressable>
        </ExternalLink>
      </View>
    </View>
  );
}
