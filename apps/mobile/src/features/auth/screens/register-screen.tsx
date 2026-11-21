import { router } from 'expo-router';
import { DEFAULT_CURRENCY_SYMBOL } from '@repo/contracts';
import { useState } from 'react';
import {
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
import { DashboardScreen } from '@/features/dashboard/screens/dashboard-screen';

export function RegisterScreen() {
  const { isAuthenticated, login } = useAuth();
  const [registeredUser, setRegisteredUser] = useState<{
    name: string;
    email: string;
  } | null>(null);

  if (isAuthenticated) {
    return <DashboardScreen />;
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1">
          <ScrollView
            contentContainerClassName="flex-grow items-center py-4 px-4 pb-16"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View
              className="w-full max-w-[460px] self-center rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5"
              style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
              {registeredUser ? (
                <View className="items-center">
                  <View className="w-16 h-16 rounded-2xl bg-emerald-500 items-center justify-center shadow-lg shadow-emerald-500/30 mb-3">
                    <Text className="text-3xl font-bold text-white leading-none">✓</Text>
                  </View>

                  <Text className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center">
                    Welcome, {registeredUser.name}!
                  </Text>

                  <View className="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-4 py-3 w-full items-center my-4">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Account Created
                    </Text>
                    <Text className="text-sm font-bold text-emerald-900 dark:text-emerald-100 mt-0.5">
                      {registeredUser.email}
                    </Text>
                  </View>

                  <Text className="text-sm leading-6 text-slate-500 dark:text-slate-400 text-center mb-6">
                    Your account has been successfully created. You can now sign in to start
                    managing your budgets and finances.
                  </Text>

                  <View className="w-full">
                    <Pressable
                      onPress={() => {
                        login(registeredUser.email, registeredUser.name);
                        router.replace('/dashboard');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Proceed to Sign In"
                      className="w-full h-12 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-md shadow-brand-500/25">
                      <Text className="text-base font-semibold text-white">
                        Proceed to Sign In
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
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
                    <Text className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-center">
                      Create an account
                    </Text>
                    <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                      Start tracking your budget and expenses today
                    </Text>
                  </View>

                  <RegisterForm onSuccess={(user) => setRegisteredUser(user)} />

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
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
