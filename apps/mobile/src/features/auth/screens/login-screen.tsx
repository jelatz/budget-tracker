import { Redirect, router } from 'expo-router';
import { DEFAULT_CURRENCY_SYMBOL } from '@repo/contracts';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginForm } from '@/features/auth/components/login-form';
import { useAuth } from '@/features/auth/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

export function LoginScreen() {
  const { isAuthenticated, isHydrating } = useAuth();
  const theme = useTheme();

  if (isHydrating) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <SafeAreaView className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.text} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/dashboard" />;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: 24,
              paddingHorizontal: 16,
            }}
            keyboardShouldPersistTaps="handled">
            <View
              className="w-full max-w-[440px] self-center rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5"
              style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
              {/* Header & Brand Badge */}
              <View className="items-center mb-6">
                <View className="w-16 h-16 rounded-2xl bg-brand-500 items-center justify-center shadow-lg shadow-brand-500/30 mb-3">
                  <Text className="text-white text-3xl font-bold leading-none">
                    {DEFAULT_CURRENCY_SYMBOL}
                  </Text>
                </View>

                {/* Subtle Pill Subtitle Badge */}
                <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 mb-2">
                  <Text className="text-[10px] font-bold tracking-widest uppercase text-slate-500 dark:text-slate-400">
                    FINTECH WORKSPACE
                  </Text>
                </View>

                <Text
                  accessibilityRole="header"
                  className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center">
                  Welcome back
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                  Sign in to sync across Web &amp; Mobile
                </Text>
              </View>

              {/* Login Form */}
              <LoginForm
                onSuccess={() => {
                  router.replace('/dashboard');
                }}
              />

              {/* Register / Sign-up link */}
              <View className="flex-row items-center justify-center mt-6">
                <Text className="text-sm text-slate-500 dark:text-slate-400">
                  Don&apos;t have an account?{' '}
                </Text>
                <Pressable
                  onPress={() => router.push('/register')}
                  accessibilityRole="button"
                  accessibilityLabel="Create one"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="active:opacity-75">
                  <Text className="text-sm font-semibold text-brand-500 dark:text-brand-400">
                    Create one
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
