import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
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
          className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 px-4 py-3 flex-row items-center gap-2.5">
          <Text className="text-sm font-medium text-rose-600 dark:text-rose-400 flex-1 leading-5">
            {formError}
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
            if (emailError) setEmailError(null);
            if (formError) setFormError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            emailError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } text-slate-900 dark:text-slate-100 text-base`}
        />
        {emailError ? (
          <Text
            accessibilityRole="alert"
            className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5">
            {emailError}
          </Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Password
        </Text>
        <View
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            passwordError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
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
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
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
        {passwordError ? (
          <Text
            accessibilityRole="alert"
            className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5">
            {passwordError}
          </Text>
        ) : null}
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
          <ActivityIndicator color={Colors.dark.text} size="small" />
        ) : (
          <Text className="text-base font-semibold text-white tracking-wide">
            Sign In
          </Text>
        )}
      </Pressable>
    </View>
  );
}
