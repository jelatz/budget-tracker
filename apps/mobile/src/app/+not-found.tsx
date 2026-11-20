import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/context/auth-context';

export default function NotFoundScreen() {
  const { isAuthenticated } = useAuth();
  const targetRoute = isAuthenticated ? '/dashboard' : '/';
  const buttonLabel = isAuthenticated ? 'Back to Dashboard' : 'Back to Sign In';

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
          <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
            <Text className="text-[11px] font-bold tracking-widest uppercase text-slate-600 dark:text-slate-300">
              404 — NOT FOUND
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center"
          >
            Page not found
          </Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
            The screen you requested does not exist or may have moved.
          </Text>
          <Pressable
            onPress={() => router.replace(targetRoute)}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            className="w-full min-h-[44px] h-12 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center px-5 mt-1"
          >
            <Text className="text-base font-semibold text-white">{buttonLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
