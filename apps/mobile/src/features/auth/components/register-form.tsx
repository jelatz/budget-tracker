import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

export type RegisterFormProps = {
  onSubmit: (user: { name: string; email: string; password: string }) => Promise<void>;
};

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const isNameError = Boolean(errorMessage && errorMessage.toLowerCase().includes('name'));
  const isEmailError = Boolean(errorMessage && errorMessage.toLowerCase().includes('email'));
  const isPasswordError = Boolean(
    errorMessage && errorMessage.toLowerCase().includes('at least 6 characters'),
  );
  const isConfirmError = Boolean(errorMessage && errorMessage.toLowerCase().includes('match'));
  const isGeneralError = Boolean(
    errorMessage && !isNameError && !isEmailError && !isPasswordError && !isConfirmError,
  );

  const handleRegister = async () => {
    if (isSubmittingRef.current || isLoading) return;
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

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setErrorMessage(null);
    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      await onSubmit({ name: trimmedName, email: trimmedEmail, password });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while creating your account.';
      setErrorMessage(message);
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <View className="w-full gap-4">
      {isGeneralError ? (
        <View className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 p-3.5">
          <Text className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Full Name
        </Text>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="Jane Doe"
          placeholderTextColor="#94a3b8"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            isNameError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } text-slate-900 dark:text-slate-100 text-base`}
        />
        {isNameError ? (
          <Text className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5">
            {errorMessage}
          </Text>
        ) : null}
      </View>

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
            isEmailError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } text-slate-900 dark:text-slate-100 text-base`}
        />
        {isEmailError ? (
          <Text className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Password
        </Text>
        <View
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            isPasswordError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } flex-row items-center justify-between`}>
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="At least 6 characters"
            placeholderTextColor="#94a3b8"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!isLoading}
            className="flex-1 h-full text-slate-900 dark:text-slate-100 text-base pr-2"
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="px-2 py-1 active:opacity-75">
            <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>
        {isPasswordError ? (
          <Text className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Confirm Password
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="Re-enter password"
          placeholderTextColor="#94a3b8"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!isLoading}
          className={`h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border ${
            isConfirmError
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-700'
          } text-slate-900 dark:text-slate-100 text-base`}
        />
        {isConfirmError ? (
          <Text className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-0.5">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={handleRegister}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel="Create Account"
        className={`h-12 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-md shadow-brand-500/25 mt-2 ${
          isLoading ? 'opacity-70' : ''
        }`}>
        {isLoading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text className="text-base font-semibold text-white">Create Account</Text>
        )}
      </Pressable>
    </View>
  );
}
