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

import { RegisterForm } from '@/features/auth/components/register-form';
import { useAuth } from '@/features/auth/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

export function RegisterScreen() {
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
      <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1">
          <ScrollView
            contentContainerClassName="flex-grow items-center py-4 px-4 pb-16"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View
              className="w-full max-w-[460px] self-center rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5"
              style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
              <View className="items-center mb-6">
                <View className="w-16 h-16 rounded-2xl bg-brand-500 items-center justify-center shadow-lg shadow-brand-500/30 mb-3">
                  <Text className="text-3xl font-extrabold text-white leading-none">
                    {DEFAULT_CURRENCY_SYMBOL}
                  </Text>
                </View>
                <View className="px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800/50 mb-2">
                  <Text className="text-[11px] font-bold tracking-wider text-brand-600 dark:text-brand-400 uppercase">
                    GET STARTED
                  </Text>
                </View>
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center">
                  Create an account
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                  Sync your budget and expenses across devices
                </Text>
              </View>

              <RegisterForm
                onSuccess={() => {
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
                  className="active:opacity-75">
                  <Text className="text-sm font-semibold text-brand-500 dark:text-brand-400">
                    Sign In
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
