import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '../context/auth-context';

export type RegisterFormProps = {
  onSuccess: (user: { name: string; email: string }) => void;
};

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const theme = useTheme();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isNameError = Boolean(errorMessage && errorMessage.toLowerCase().includes('name'));
  const isEmailError = Boolean(errorMessage && errorMessage.toLowerCase().includes('email'));
  const isPasswordError = Boolean(
    errorMessage && errorMessage.toLowerCase().includes('at least 8 characters'),
  );
  const isConfirmError = Boolean(errorMessage && errorMessage.toLowerCase().includes('match'));
  const isGeneralError = Boolean(
    errorMessage && !isNameError && !isEmailError && !isPasswordError && !isConfirmError,
  );

  const handleRegister = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      await signUp({
        name: trimmedName,
        email: trimmedEmail,
        password,
      });
      onSuccess({ name: trimmedName, email: trimmedEmail });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while creating your account.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="w-full gap-4">
      {isGeneralError ? (
        <View
          accessibilityRole="alert"
          className="rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-terracotta/30 dark:border-ledger-terracotta-dark/40 p-3.5">
          <ThemedText className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark">
            {errorMessage}
          </ThemedText>
        </View>
      ) : null}

      <View className="gap-1.5">
        <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Full Name
        </ThemedText>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="Jane Doe"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Full Name"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            isNameError
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          } text-ledger-ink dark:text-ledger-ink-dark text-base`}
        />
        {isNameError ? (
          <ThemedText accessibilityRole="alert" className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5">
            {errorMessage}
          </ThemedText>
        ) : null}
      </View>

      <View className="gap-1.5">
        <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Email address
        </ThemedText>
        <TextInput
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            isEmailError
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          } text-ledger-ink dark:text-ledger-ink-dark text-base`}
        />
        {isEmailError ? (
          <ThemedText accessibilityRole="alert" className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5">
            {errorMessage}
          </ThemedText>
        ) : null}
      </View>

      <View className="gap-1.5">
        <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Password
        </ThemedText>
        <View
          className={`h-12 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            isPasswordError
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          } flex-row items-center justify-between`}>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="At least 8 characters"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!isLoading}
            className="flex-1 h-full text-ledger-ink dark:text-ledger-ink-dark text-base pr-2"
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="px-2 py-1 active:opacity-75">
            <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              {showPassword ? 'Hide' : 'Show'}
            </ThemedText>
          </Pressable>
        </View>
        {isPasswordError ? (
          <ThemedText accessibilityRole="alert" className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5">
            {errorMessage}
          </ThemedText>
        ) : null}
      </View>

      <View className="gap-1.5">
        <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Confirm Password
        </ThemedText>
        <TextInput
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="Re-enter password"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Confirm Password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            isConfirmError
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          } text-ledger-ink dark:text-ledger-ink-dark text-base`}
        />
        {isConfirmError ? (
          <ThemedText accessibilityRole="alert" className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5">
            {errorMessage}
          </ThemedText>
        ) : null}
      </View>

      <Pressable
        onPress={handleRegister}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Create Account"
        className={`h-12 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 items-center justify-center mt-2 ${
          isLoading ? 'opacity-70' : ''
        }`}>
        {isLoading ? (
          <ActivityIndicator color={theme.onPrimary} size="small" />
        ) : (
          <ThemedText className="text-base font-semibold text-ledger-canvas dark:text-ledger-canvas-dark">
            Create Account
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}
