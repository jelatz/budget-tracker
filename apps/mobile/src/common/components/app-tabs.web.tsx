import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Href, router, usePathname } from 'expo-router';
import {
  GestureResponderEvent,
  Pressable,
  ScrollView,
  useColorScheme,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import { useAuth } from '@/features/auth/context/auth-context';
import { useThemeMode } from '@/common/context/theme-mode-context';
import { ThemedText } from './themed-text';

export const DrawerNavContext = createContext<{
  isCompactViewport: boolean;
  closeDrawer: () => void;
}>({
  isCompactViewport: false,
  closeDrawer: () => {},
});

export default function AppTabs() {
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const isCompactViewport = width < 768;

  return (
    <Tabs
      style={{
        flex: 1,
        flexDirection: isAuthenticated && !isCompactViewport ? 'row' : 'column',
      }}>
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="dashboard" href="/dashboard" asChild>
            <TabButton>Dashboard</TabButton>
          </TabTrigger>
          <TabTrigger name="capture" href="/capture" asChild>
            <TabButton>Fast Capture</TabButton>
          </TabTrigger>
          <TabTrigger name="transactions" href="/transactions" asChild>
            <TabButton>Transactions</TabButton>
          </TabTrigger>
          <TabTrigger name="reconciliation" href="/reconciliation" asChild>
            <TabButton>Reconcile</TabButton>
          </TabTrigger>
          <TabTrigger name="portability" href="/portability" asChild>
            <TabButton>Data & Backup</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton>Settings</TabButton>
          </TabTrigger>
          <TabTrigger name="index" href="/" style={{ display: 'none' }} />
          <TabTrigger name="register" href="/register" style={{ display: 'none' }} />
        </CustomTabList>
      </TabList>
      <TabSlot
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          paddingTop: isAuthenticated && isCompactViewport ? 56 : 0,
          paddingBottom: isAuthenticated && isCompactViewport ? 72 : 0,
        }}
      />
    </Tabs>
  );
}

export interface TabButtonProps extends Omit<TabTriggerSlotProps, 'children'> {
  children?: React.ReactNode;
  badge?: string;
  targetHref?: Href;
}

export function TabButton({
  children,
  isFocused,
  badge,
  targetHref,
  ...props
}: TabButtonProps) {
  const {
    ref: _ref,
    style: _slotStyle,
    onPress,
    href: _injectedHref,
    ...pressableProps
  } = props as Omit<TabTriggerSlotProps, 'children' | 'isFocused'> & { href?: string };
  const { isCompactViewport, closeDrawer } = useContext(DrawerNavContext);

  const handlePress = (event: GestureResponderEvent) => {
    onPress?.(event);
    const destination = targetHref ?? (_injectedHref as Href | undefined);
    if (destination) {
      router.navigate(destination);
    }
    if (isCompactViewport) {
      closeDrawer();
    }
  };

  return (
    <Pressable
      {...pressableProps}
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
      }}
      className={`w-full flex-row items-center px-3.5 py-2.5 rounded-xl transition-all duration-150 min-h-[44px] ${
        isFocused
          ? 'bg-[#208AEF]/10 dark:bg-[#208AEF]/20'
          : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/60 active:opacity-80'
      }`}>
      <ThemedText
        numberOfLines={1}
        className={`text-sm flex-1 ${
          isFocused
            ? 'font-semibold text-[#208AEF] dark:text-[#60a5fa]'
            : 'font-medium text-slate-600 dark:text-slate-300'
        }`}>
        {children}
      </ThemedText>
      {badge && (
        <View className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">
          <ThemedText className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
            {badge}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

interface BottomNavItem {
  label: string;
  href: Href;
  isPrimary?: boolean;
}

const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Ledger', href: '/transactions' },
  { label: '+ Capture', href: '/capture', isPrimary: true },
  { label: 'Reconcile', href: '/reconciliation' },
  { label: 'Settings', href: '/settings' },
];

export function CustomTabList(props: TabListProps) {
  const { children, style: _tabListStyle, ...tabListProps } = props;
  const { isAuthenticated, user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const systemScheme = useColorScheme();
  const webTheme = useThemeMode();
  const resolvedScheme = webTheme?.resolvedScheme ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const toggleTheme = webTheme?.toggleTheme ?? (() => {});

  if (!isAuthenticated) {
    return <View style={{ display: 'none' }}>{children}</View>;
  }

  const isCompactViewport = width < 768;
  const isDark = resolvedScheme === 'dark';
  const theme = {
    backgroundElement: isDark ? '#0b1326' : '#ffffff',
    border: isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0',
  };

  const sidebarPanel = (
    <DrawerNavContext.Provider
      value={{ isCompactViewport, closeDrawer: () => setDrawerOpen(false) }}>
      <View
        style={{
          width: isCompactViewport
            ? Math.min(280, Math.max(240, width - 56))
            : 240,
          height: '100%',
          backgroundColor: theme.backgroundElement,
          borderRightWidth: 1,
          borderRightColor: theme.border,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 16,
        }}>
        {/* Top Navigation List wrapped in ScrollView */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Brand Header */}
          <View className="flex-row items-center justify-between gap-3 px-1 py-2 mb-2">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              <View className="w-9 h-9 rounded-xl bg-[#208AEF] items-center justify-center shadow-sm shadow-[#208AEF]/30">
                <ThemedText className="text-white font-extrabold font-mono text-sm">₱</ThemedText>
              </View>
              <View className="flex-1 min-w-0">
                <ThemedText className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight">
                  Budget Tracker
                </ThemedText>
                <ThemedText className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  Fintech Workspace
                </ThemedText>
              </View>
            </View>
            {isCompactViewport && (
              <Pressable
                onPress={() => setDrawerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close navigation drawer"
                className="min-h-[44px] justify-center px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:opacity-75">
                <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  ✕ Close
                </ThemedText>
              </Pressable>
            )}
          </View>

          {/* Fast Entry CTA */}
          <Pressable
            onPress={() => {
              if (isCompactViewport) {
                setDrawerOpen(false);
              }
              router.navigate('/capture');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open Fast Entry"
            className="w-full flex-row items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#208AEF] hover:bg-[#1B74CC] active:opacity-90 shadow-sm min-h-[44px] my-3 transition-colors">
            <ThemedText className="text-white text-sm font-semibold">
              Fast Entry
            </ThemedText>
          </Pressable>

          {/* Navigation Items (children rendered vertically) */}
          <View className="w-full gap-1 pt-1">{children}</View>
        </ScrollView>

        {/* Bottom Footer */}
        <View className="w-full gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800/90">
          {/* Theme Switcher button */}
          <Pressable
            onPress={toggleTheme}
            accessibilityRole="button"
            accessibilityLabel="Toggle Theme"
            className="w-full flex-row items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 min-h-[44px] transition-colors">
            <View className="w-7 h-7 rounded-lg items-center justify-center bg-slate-100 dark:bg-slate-800/80">
              <NavIcon
                name={resolvedScheme === 'dark' ? 'sun' : 'moon'}
                size={15}
                color={resolvedScheme === 'dark' ? '#f59e0b' : '#64748b'}
              />
            </View>
            <ThemedText className="text-xs font-medium text-slate-600 dark:text-slate-300 flex-1">
              {resolvedScheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </ThemedText>
          </Pressable>

          {/* User Account & Sign Out */}
          <View className="pt-2 border-t border-slate-200/80 dark:border-slate-800/90 gap-2">
            <View className="flex-row items-center gap-2.5 px-1">
              <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-slate-700">
                <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {(user?.email?.[0] ?? 'U').toUpperCase()}
                </ThemedText>
              </View>
              <View className="flex-1 min-w-0">
                <ThemedText
                  numberOfLines={1}
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {user?.email ?? 'User'}
                </ThemedText>
                <ThemedText className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Verified Account
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={() => {
                if (isCompactViewport) {
                  setDrawerOpen(false);
                }
                void logout().finally(() => {
                  router.replace('/');
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
              className="w-full flex-row items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 min-h-[44px] transition-colors">
              <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Sign Out
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </DrawerNavContext.Provider>
  );

  if (!isCompactViewport) {
    return (
      <View
        {...tabListProps}
        style={{
          width: 240,
          height: '100%',
          flexDirection: 'column',
          flexShrink: 0,
          zIndex: 40,
        }}>
        {sidebarPanel}
      </View>
    );
  }

  return (
    <View
      {...tabListProps}
      pointerEvents="box-none"
      style={
        {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          pointerEvents: 'box-none',
        } as unknown as ViewStyle
      }>
      {/* 1. Backdrop */}
      {drawerOpen && (
        <Pressable
          onPress={() => setDrawerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close navigation drawer"
          style={
            {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 65,
            } as unknown as ViewStyle
          }
        />
      )}

      {/* 2. Drawer panel inside fixed overlay container that remains mounted */}
      <View
        pointerEvents={drawerOpen ? 'auto' : 'none'}
        style={
          {
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            zIndex: 70,
            transform: [{ translateX: drawerOpen ? 0 : -320 }],
            pointerEvents: drawerOpen ? 'auto' : 'none',
          } as unknown as ViewStyle
        }>
        {sidebarPanel}
      </View>

      {/* 3. Top mobile header bar */}
      <View
        pointerEvents="auto"
        style={
          {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            zIndex: 60,
            backgroundColor: theme.backgroundElement,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            pointerEvents: 'auto',
          } as unknown as ViewStyle
        }>
        {/* Left: Hamburger menu button */}
        <Pressable
          onPress={() => setDrawerOpen((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
          style={{
            minHeight: 44,
            minWidth: 44,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
            borderRadius: 8,
          }}
          className="hover:bg-slate-100 dark:hover:bg-slate-800 active:opacity-75">
          <ThemedText style={{ fontSize: 18, marginRight: 6, lineHeight: 20 }}>
            {drawerOpen ? '✕' : '☰'}
          </ThemedText>
          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Menu
          </ThemedText>
        </Pressable>

        {/* Center/Left-adjacent: Brand badge + title */}
        <View className="flex-row items-center gap-2">
          <View className="w-7 h-7 rounded-lg bg-[#208AEF] items-center justify-center shadow-sm">
            <ThemedText className="text-white font-extrabold font-mono text-xs">₱</ThemedText>
          </View>
          <ThemedText className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            BudgetTracker
          </ThemedText>
        </View>

        {/* Right: Compact "+ Capture" quick-action pill */}
        <Pressable
          onPress={() => {
            setDrawerOpen(false);
            router.navigate('/capture');
          }}
          accessibilityRole="button"
          accessibilityLabel="Quick capture transaction"
          style={{
            minHeight: 44,
            minWidth: 44,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              borderRadius: 9999,
              backgroundColor: '#208AEF',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className="hover:bg-[#1B74CC] active:opacity-90 shadow-sm">
            <ThemedText className="text-white text-xs font-bold leading-none">
              + Capture
            </ThemedText>
          </View>
        </Pressable>
      </View>

      {/* 4. Fixed bottom mobile tab bar */}
      <View
        pointerEvents="auto"
        style={
          {
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            minHeight: 60,
            zIndex: 55,
            backgroundColor: theme.backgroundElement,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            paddingHorizontal: 4,
            paddingVertical: 6,
            pointerEvents: 'auto',
          } as unknown as ViewStyle
        }>
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard' || pathname === '/'
              : typeof item.href === 'string'
              ? pathname.startsWith(item.href)
              : false;

          if (item.isPrimary) {
            return (
              <Pressable
                key={typeof item.href === 'string' ? item.href : item.label}
                onPress={() => {
                  setDrawerOpen(false);
                  router.navigate(item.href);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={item.label}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 48,
                  paddingHorizontal: 2,
                }}>
                <View
                  style={{
                    backgroundColor: '#208AEF',
                    borderRadius: 14,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <ThemedText
                    numberOfLines={1}
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: '#ffffff',
                    }}>
                    {item.label}
                  </ThemedText>
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={typeof item.href === 'string' ? item.href : item.label}
              onPress={() => {
                setDrawerOpen(false);
                router.navigate(item.href);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={item.label}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 48,
                paddingHorizontal: 2,
              }}>
              <View
                style={{
                  width: 16,
                  height: 3,
                  borderRadius: 2,
                  marginBottom: 3,
                  backgroundColor: isActive ? '#208AEF' : 'transparent',
                }}
              />
              <ThemedText
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? '700' : '500',
                  color: isActive
                    ? '#208AEF'
                    : resolvedScheme === 'dark'
                    ? '#94a3b8'
                    : '#64748b',
                }}>
                {item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NavIcon({
  name,
  size = 16,
  color = 'currentColor',
}: {
  name?: string;
  size?: number;
  color?: string;
}) {
  switch (name) {
    case 'sun':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case 'moon':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    default:
      return null;
  }
}
