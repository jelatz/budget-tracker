import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

export type LoginFormProps = {
  onSuccess: (email: string) => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUseDemoCredentials = () => {
    const demoEmail = 'demo@budgettracker.app';
    const demoPassword = 'password123';
    setEmail(demoEmail);
    setPassword(demoPassword);
    setErrorMessage(null);
  };

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      onSuccess(trimmedEmail);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred during sign-in.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const hasEmailError = Boolean(
    errorMessage &&
      (errorMessage.toLowerCase().includes('email') ||
        (!email.trim() || !email.includes('@')))
  );

  const hasPasswordError = Boolean(
    errorMessage &&
      (errorMessage.toLowerCase().includes('password') || password.length < 6)
  );

  return (
    <View className="w-full gap-4">
      {errorMessage ? (
        <View className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 px-4 py-3 flex-row items-center gap-2.5">
          <Text className="text-sm font-medium text-rose-600 dark:text-rose-400 flex-1 leading-5">
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Email address
        </Text>
        <TextInput
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            hasEmailError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } text-slate-900 dark:text-slate-100 text-base`}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Password
        </Text>
        <View
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            hasPasswordError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } flex-row items-center justify-between`}>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="••••••••"
            placeholderTextColor="#94a3b8"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            editable={!isLoading}
            className="flex-1 h-full text-slate-900 dark:text-slate-100 text-base"
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="ml-2 py-1 px-1.5 active:opacity-70">
            <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={handleSignIn}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Sign In"
        className={`h-12 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-md shadow-brand-500/25 mt-1 ${
          isLoading ? 'opacity-70' : ''
        }`}>
        {isLoading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text className="text-base font-semibold text-white tracking-wide">
            Sign In
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleUseDemoCredentials}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Use Demo Credentials"
        className={`h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75 ${
          isLoading ? 'opacity-70' : ''
        }`}>
        <Text className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Use Demo Credentials
        </Text>
      </Pressable>
    </View>
  );
}
