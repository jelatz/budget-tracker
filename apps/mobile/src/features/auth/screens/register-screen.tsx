import { router } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RegisterForm } from '@/features/auth/components/register-form';
import { useAuth } from '@/features/auth/context/auth-context';

function FintechHeroPanel() {
  return (
    <View className="flex-1 rounded-3xl bg-[#0b1326] dark:bg-[#131b2e] border border-slate-800 p-8 gap-6 shadow-2xl">
      {/* Brand Pill */}
      <View className="self-start px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30">
        <Text className="text-[11px] font-bold tracking-widest uppercase text-brand-400">
          FINTECH COMMAND CENTER
        </Text>
      </View>

      {/* Headline & Subtitle */}
      <View className="gap-2">
        <Text className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
          Master your real-time liquidity.
        </Text>
        <Text className="text-sm text-slate-400 leading-relaxed">
          A zero-leakage financial operating system designed for disciplined budgeting,
          automated safe-to-spend reserves, and rapid reconciliation.
        </Text>
      </View>

      {/* 3 Structured Highlight Rows */}
      <View className="gap-4 pt-2">
        <View className="flex-row items-start gap-3.5">
          <View className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 items-center justify-center shrink-0 mt-0.5">
            <Text className="text-xs font-mono font-bold text-brand-400">01</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-white">Safe-to-Spend Engine</Text>
            <Text className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Reserves sinking funds, unpaid bills, and envelopes automatically.
            </Text>
          </View>
        </View>

        <View className="flex-row items-start gap-3.5">
          <View className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center shrink-0 mt-0.5">
            <Text className="text-xs font-mono font-bold text-emerald-400">02</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-white">Zero-Sum Envelopes & Vaults</Text>
            <Text className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Monthly spending pots with rollover surplus and savings targets.
            </Text>
          </View>
        </View>

        <View className="flex-row items-start gap-3.5">
          <View className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 items-center justify-center shrink-0 mt-0.5">
            <Text className="text-xs font-mono font-bold text-sky-400">03</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-white">Sub-3s Calculator Capture</Text>
            <Text className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Split transactions, quick presets, and instant balance reconciliation.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function CompactMobileBrandHeader() {
  return (
    <View
      className="w-full max-w-[440px] rounded-3xl bg-[#0b1326] dark:bg-[#131b2e] border border-slate-800 p-5 mb-4 gap-2 shadow-sm"
      style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
      <View className="self-start px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30">
        <Text className="text-[10px] font-bold tracking-widest uppercase text-brand-400">
          FINTECH COMMAND CENTER
        </Text>
      </View>
      <Text className="text-xl font-extrabold text-white tracking-tight">
        Master your real-time liquidity.
      </Text>
      <View className="flex-row flex-wrap gap-1.5 pt-1">
        <View className="px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20">
          <Text className="text-[11px] font-medium text-brand-300">Safe-to-Spend</Text>
        </View>
        <View className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <Text className="text-[11px] font-medium text-emerald-300">Zero-Sum Envelopes</Text>
        </View>
        <View className="px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20">
          <Text className="text-[11px] font-medium text-sky-300">Fast Capture</Text>
        </View>
      </View>
    </View>
  );
}

export function RegisterScreen() {
  const { isAuthenticated, isHydrating, register } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 960;

  useEffect(() => {
    if (!isHydrating && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isHydrating, isAuthenticated]);

  if (isHydrating) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-[#0b1326] items-center justify-center gap-3">
        <ActivityIndicator size="large" color="#208AEF" />
        <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Restoring your session...
        </Text>
      </View>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  const registerCard = (
    <View
      className="w-full max-w-[460px] rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200/80 dark:border-slate-800/90 p-6 sm:p-8 shadow-xl shadow-slate-900/5"
      style={{ width: '100%', maxWidth: 460, alignSelf: isDesktop ? 'auto' : 'center' }}
    >
      <View className="items-center mb-6">
        <View className="w-16 h-16 rounded-2xl bg-brand-500 items-center justify-center shadow-lg shadow-brand-500/30 mb-3">
          <Text className="text-3xl font-extrabold text-white leading-none font-mono">₱</Text>
        </View>
        <View className="px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800/50 mb-2">
          <Text className="text-[11px] font-bold tracking-wider text-brand-600 dark:text-brand-400 uppercase">
            GET STARTED
          </Text>
        </View>
        <Text className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center">
          Create an account
        </Text>
        <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
          Create a synced account for phone and desktop
        </Text>
      </View>

      <RegisterForm
        onSubmit={async ({ name, email, password }) => {
          await register(name, email, password);
          router.replace('/dashboard');
        }}
      />

      <View className="flex-row items-center justify-center mt-6">
        <Text className="text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
        </Text>
        <Pressable
          onPress={() => router.push('/')}
          accessibilityRole="button"
          accessibilityLabel="Sign In"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="active:opacity-75 min-h-[44px] justify-center"
        >
          <Text className="text-sm font-semibold text-brand-500 dark:text-brand-400">
            Sign In
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0b1326]">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: isDesktop ? 32 : 16,
              paddingHorizontal: isDesktop ? 24 : 16,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {isDesktop ? (
              <View
                className="w-full self-center flex-row gap-8 items-center justify-center"
                style={{ width: '100%', maxWidth: 1080 }}>
                <FintechHeroPanel />
                {registerCard}
              </View>
            ) : (
              <>
                <CompactMobileBrandHeader />
                {registerCard}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
