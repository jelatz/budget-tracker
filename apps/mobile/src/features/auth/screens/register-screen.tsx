import { Redirect, router } from 'expo-router';
import { DEFAULT_CURRENCY_SYMBOL } from '@repo/contracts';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/common/components/themed-text';
import { RegisterForm } from '@/features/auth/components/register-form';
import { useAuth } from '@/features/auth/context/auth-context';
import { useTheme } from '@/hooks/use-theme';

export function RegisterScreen() {
  const { isAuthenticated, isHydrating } = useAuth();
  const theme = useTheme();

  if (isHydrating) {
    return (
      <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark items-center justify-center">
        <SafeAreaView className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.primary} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/dashboard" />;
  }

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: 24,
              paddingHorizontal: 16,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View
              className="w-full max-w-[460px] self-center rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark p-6 sm:p-8 border border-ledger-border dark:border-ledger-border-dark"
              style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
              <View className="items-center mb-6">
                <View className="w-14 h-14 rounded-2xl bg-brand-500 dark:bg-brand-400 items-center justify-center mb-4">
                  <ThemedText className="text-2xl font-bold text-ledger-canvas dark:text-ledger-canvas-dark leading-none">
                    {DEFAULT_CURRENCY_SYMBOL}
                  </ThemedText>
                </View>

                <ThemedText
                  accessibilityRole="header"
                  className="text-2xl font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark text-center">
                  Create an account
                </ThemedText>
                <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center mt-1">
                  Sync your budget and accounts across devices
                </ThemedText>
              </View>

              <RegisterForm
                onSuccess={() => {
                  router.replace('/dashboard');
                }}
              />

              <View className="flex-row items-center justify-center mt-6 pt-5 border-t border-ledger-border dark:border-ledger-border-dark">
                <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Already have an account?{' '}
                </ThemedText>
                <Pressable
                  onPress={() => router.push('/')}
                  accessibilityRole="button"
                  accessibilityLabel="Sign In"
                  hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                  className="py-1 active:opacity-75">
                  <ThemedText className="text-sm font-semibold text-brand-500 dark:text-brand-400">
                    Sign In
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
