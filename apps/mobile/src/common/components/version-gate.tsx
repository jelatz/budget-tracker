import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVersionGate } from '@/common/hooks/use-version-gate';

/**
 * Blocks outdated clients when the backend raises `minSupportedVersion` past this app build.
 */
export function VersionGate({ children }: { children: React.ReactNode }) {
  const status = useVersionGate();

  if (status === 'update-required') {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
        <SafeAreaView
          className="flex-1 items-center justify-center p-6"
          edges={['top', 'right', 'bottom', 'left']}
        >
          <View
            className="w-full max-w-[440px] rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 p-7 items-center gap-4 shadow-xl shadow-slate-900/5"
            style={{ width: '100%', maxWidth: 440 }}
          >
            <View className="w-16 h-16 rounded-2xl bg-brand-500 items-center justify-center shadow-lg shadow-brand-500/30">
              <Text className="text-white text-3xl font-bold leading-none font-mono">₱</Text>
            </View>
            <View className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70">
              <Text className="text-[11px] font-bold tracking-widest uppercase text-amber-700 dark:text-amber-300">
                UPDATE REQUIRED
              </Text>
            </View>
            <Text
              accessibilityRole="header"
              className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center"
            >
              Please update Budget Tracker
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              This version of the app is no longer supported by the sync server. Install the
              latest update to continue syncing your budgets and transactions safely.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return <>{children}</>;
}
