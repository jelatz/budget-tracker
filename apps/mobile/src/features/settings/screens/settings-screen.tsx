import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ThemedText } from '@/common/components/themed-text';
import {
  BottomTabInset,
  NarrowContentWidth,
  StitchTokens,
} from '@/common/constants/theme';
import {
  useThemeMode,
  type ThemeMode,
} from '@/common/context/theme-mode-context';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import { getApiBaseUrl } from '@/common/lib/api-client';
import { confirmAction } from '@/common/lib/confirm';
import {
  useClearAllTransactions,
  useResetDemoData,
} from '@/features/transactions/hooks/use-transactions';

const THEME_OPTIONS: ReadonlyArray<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const { isAuthenticated, user, logout } = useRequireAuth();
  const { themeMode, resolvedScheme, setThemeMode } = useThemeMode();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 640;
  const isDesktop = Platform.OS === 'web' && width >= 960;

  const clearAllMutation = useClearAllTransactions();
  const resetDemoMutation = useResetDemoData();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const apiBaseUrl = getApiBaseUrl();

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
      router.replace('/');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleClearAll = async () => {
    const confirmed = await confirmAction({
      title: 'Clear All Entries',
      message:
        'Remove all recorded transactions and reset every wallet back to its opening balance? This cannot be undone.',
      confirmLabel: 'Clear All',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await clearAllMutation.mutateAsync();
      setStatusMessage(
        'All transactions cleared and wallets restored to their opening balances.',
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to clear entries.',
      );
    }
  };

  const handleRestoreDemo = async () => {
    const confirmed = await confirmAction({
      title: 'Restore Demo Data',
      message:
        'Replace your current transactions, wallets, and budgets with sample PHP demo data?',
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await resetDemoMutation.mutateAsync();
      setStatusMessage('Sample PHP demo workspace restored.');
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to restore demo data.',
      );
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const signOutButton = (
    <Pressable
      onPress={() => void handleSignOut()}
      disabled={isSigningOut}
      accessibilityRole="button"
      accessibilityLabel="Sign Out"
      className={
        isWide
          ? 'min-h-[44px] shrink-0 py-2.5 px-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 items-center justify-center active:opacity-75'
          : 'min-h-[44px] w-full py-3 px-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 items-center justify-center active:opacity-75'
      }
    >
      {isSigningOut ? (
        <ActivityIndicator size="small" color={StitchTokens.rose} />
      ) : (
        <ThemedText className="text-sm font-bold text-rose-600 dark:text-rose-400">
          Sign Out
        </ThemedText>
      )}
    </Pressable>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            width: '100%',
            maxWidth: NarrowContentWidth,
            alignSelf: 'center',
            paddingHorizontal: isDesktop ? 28 : 16,
            paddingTop: isDesktop ? 24 : 16,
            paddingBottom: isDesktop
              ? 48
              : Math.max(96, insets.bottom + BottomTabInset + 24),
            gap: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="gap-0.5 py-1">
            <ThemedText className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Settings
            </ThemedText>
            <ThemedText className="text-sm text-slate-500 dark:text-slate-400">
              Account, appearance, backups, and workspace controls
            </ThemedText>
          </View>

          {/* Status & Error Banners */}
          {statusMessage && (
            <View className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 flex-row items-center justify-between gap-2">
              <ThemedText className="flex-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {statusMessage}
              </ThemedText>
              <Pressable
                onPress={() => setStatusMessage(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss status message"
                className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          )}

          {errorMessage && (
            <View className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 flex-row items-center justify-between gap-2">
              <ThemedText className="flex-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {errorMessage}
              </ThemedText>
              <Pressable
                onPress={() => setErrorMessage(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error message"
                className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* 1. Account Card */}
          <View className="p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-4">
            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Account & Sync
            </ThemedText>

            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-row items-center gap-3 flex-1 min-w-0">
                <View className="w-12 h-12 rounded-2xl bg-brand-500/15 items-center justify-center shrink-0">
                  <ThemedText className="text-lg font-extrabold text-brand-500">
                    {(user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()}
                  </ThemedText>
                </View>
                <View className="flex-1 min-w-0 gap-0.5">
                  <ThemedText
                    className="text-base font-bold text-slate-900 dark:text-white"
                    numberOfLines={1}
                  >
                    {user?.name ?? 'Personal Account'}
                  </ThemedText>
                  <ThemedText
                    className="text-xs text-slate-500 dark:text-slate-400"
                    numberOfLines={1}
                  >
                    {user?.email ?? 'Signed in'}
                  </ThemedText>
                </View>
              </View>
              {isWide ? signOutButton : null}
            </View>

            <View className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/70 dark:border-slate-800 gap-1">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                API Endpoint
              </ThemedText>
              <ThemedText
                className="text-xs font-mono text-slate-700 dark:text-slate-300"
                numberOfLines={1}
              >
                {apiBaseUrl}
              </ThemedText>
            </View>

            {!isWide ? signOutButton : null}
          </View>

          {/* 2. Appearance Card */}
          <View
            className={
              isWide
                ? 'p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm flex-row items-center justify-between gap-4'
                : 'p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-3.5'
            }
          >
            <View
              className={
                isWide
                  ? 'gap-0.5 flex-1 min-w-0'
                  : 'flex-row items-center justify-between'
              }
            >
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Appearance
              </ThemedText>
              <ThemedText className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Active: {resolvedScheme === 'dark' ? 'Dark' : 'Light'}
              </ThemedText>
            </View>

            <View
              style={isWide ? { width: 288 } : undefined}
              className="flex-row items-center bg-slate-100 dark:bg-[#171f33] p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 gap-1 shrink-0"
            >
              {THEME_OPTIONS.map((option) => {
                const isSelected = themeMode === option.mode;
                return (
                  <Pressable
                    key={option.mode}
                    onPress={() => setThemeMode(option.mode)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${option.label} theme`}
                    accessibilityState={{ selected: isSelected }}
                    className={`flex-1 min-h-[44px] rounded-xl items-center justify-center ${
                      isSelected
                        ? 'bg-brand-500 shadow-sm'
                        : 'bg-transparent active:opacity-75'
                    }`}
                  >
                    <ThemedText
                      style={{
                        color: isSelected
                          ? StitchTokens.lightSurface
                          : theme.textSecondary,
                      }}
                      className={
                        isSelected ? 'text-xs font-bold' : 'text-xs font-semibold'
                      }
                    >
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 3. Data & Tools */}
          <View className="p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 shadow-sm gap-3">
            <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Data & Tools
            </ThemedText>

            <Pressable
              onPress={() => router.push('/portability')}
              accessibilityRole="button"
              accessibilityLabel="Open Data Backup and CSV Import"
              className="min-h-[56px] p-4 rounded-2xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/80 dark:border-slate-800 flex-row items-center justify-between active:opacity-75"
            >
              <View className="flex-1 mr-3 gap-0.5">
                <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                  Data & Backup
                </ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                  Export JSON backups, download CSV, or import transactions
                </ThemedText>
              </View>
              <ThemedText className="text-sm font-bold text-brand-500">→</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => router.push('/reconciliation')}
              accessibilityRole="button"
              accessibilityLabel="Open Balance Reconciliation"
              className="min-h-[56px] p-4 rounded-2xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/80 dark:border-slate-800 flex-row items-center justify-between active:opacity-75"
            >
              <View className="flex-1 mr-3 gap-0.5">
                <ThemedText className="text-sm font-bold text-slate-900 dark:text-white">
                  Balance Reconciliation
                </ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                  Match wallet balances against bank or e-wallet statements
                </ThemedText>
              </View>
              <ThemedText className="text-sm font-bold text-brand-500">→</ThemedText>
            </Pressable>
          </View>

          {/* 4. Danger Zone */}
          <View className="p-5 rounded-3xl bg-white dark:bg-[#131b2e] border border-rose-200/80 dark:border-rose-900/60 shadow-sm gap-3">
            <View className="gap-0.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Danger Zone
              </ThemedText>
              <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                Destructive workspace resets — export a JSON backup first.
              </ThemedText>
            </View>

            <View
              className={
                isWide
                  ? 'flex-row flex-wrap items-center gap-3 pt-1'
                  : 'gap-3 pt-1'
              }
            >
              <Pressable
                onPress={() => void handleClearAll()}
                disabled={clearAllMutation.isPending || resetDemoMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Clear all transaction entries"
                className={
                  isWide
                    ? 'min-h-[44px] self-start py-2.5 px-5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 items-center justify-center active:opacity-75'
                    : 'min-h-[44px] w-full py-3 px-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 items-center justify-center active:opacity-75'
                }
              >
                <ThemedText className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {clearAllMutation.isPending
                    ? 'Clearing...'
                    : 'Clear All Entries'}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => void handleRestoreDemo()}
                disabled={resetDemoMutation.isPending || clearAllMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Restore sample demo data"
                className={
                  isWide
                    ? 'min-h-[44px] self-start py-2.5 px-5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/90 dark:border-amber-800/70 items-center justify-center active:opacity-75'
                    : 'min-h-[44px] w-full py-3 px-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/90 dark:border-amber-800/70 items-center justify-center active:opacity-75'
                }
              >
                <ThemedText className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  {resetDemoMutation.isPending
                    ? 'Restoring...'
                    : 'Restore Demo Data'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
