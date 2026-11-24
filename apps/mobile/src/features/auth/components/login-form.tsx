import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';

import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '../context/auth-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginFormProps = {
  onSuccess: () => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const theme = useTheme();
  const { signIn } = useAuth();
  const passwordInputRef = useRef<TextInputInstance>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    const nextEmailError = EMAIL_PATTERN.test(trimmedEmail)
      ? null
      : 'Please enter a valid email address.';
    const nextPasswordError =
      password.length >= 6 ? null : 'Password must be at least 6 characters long.';

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    setIsLoading(true);

    try {
      await signIn(trimmedEmail, password);
      onSuccess();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred during sign-in.';
      setFormError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="w-full gap-4">
      {formError ? (
        <View
          accessibilityRole="alert"
          className="rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-terracotta/30 dark:border-ledger-terracotta-dark/40 px-4 py-3 flex-row items-center gap-2.5">
          <ThemedText className="text-sm font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark flex-1 leading-5">
            {formError}
          </ThemedText>
        </View>
      ) : null}

      <View className="gap-1.5">
        <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Email address
        </ThemedText>
        <TextInput
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) setEmailError(null);
            if (formError) setFormError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            emailError
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          } text-ledger-ink dark:text-ledger-ink-dark text-base`}
        />
        {emailError ? (
          <ThemedText
            accessibilityRole="alert"
            className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5">
            {emailError}
          </ThemedText>
        ) : null}
      </View>

      <View className="gap-1.5">
        <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
          Password
        </ThemedText>
        <View
          className={`h-12 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            passwordError
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          } flex-row items-center justify-between`}>
          <TextInput
            ref={passwordInputRef}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            placeholder="••••••••"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            editable={!isLoading}
            className="flex-1 h-full text-ledger-ink dark:text-ledger-ink-dark text-base"
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="ml-2 py-1 px-1.5 active:opacity-70">
            <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              {showPassword ? 'Hide' : 'Show'}
            </ThemedText>
          </Pressable>
        </View>
        {passwordError ? (
          <ThemedText
            accessibilityRole="alert"
            className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark mt-0.5">
            {passwordError}
          </ThemedText>
        ) : null}
      </View>

      <Pressable
        onPress={handleSignIn}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Sign In"
        className={`h-12 rounded-xl bg-brand-500 dark:bg-brand-400 active:opacity-90 items-center justify-center mt-1 ${
          isLoading ? 'opacity-70' : ''
        }`}>
        {isLoading ? (
          <ActivityIndicator color={theme.onPrimary} size="small" />
        ) : (
          <ThemedText className="text-base font-semibold text-ledger-canvas dark:text-ledger-canvas-dark tracking-wide">
            Sign In
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}
