import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/common/hooks/use-theme';
import { AppIcon } from './app-icon';
import { ThemedText } from './themed-text';

type ToastKind = 'success' | 'error';

interface ActiveToast {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface FeedbackContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  dismiss: () => void;
}

const SUCCESS_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const nextIdRef = useRef(1);

  const dismiss = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setToast({ id, kind, message: trimmed });
  }, []);

  const showSuccess = useCallback(
    (message: string) => {
      showToast('success', message);
    },
    [showToast],
  );

  const showError = useCallback(
    (message: string) => {
      showToast('error', message);
    },
    [showToast],
  );

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutMs =
      toast.kind === 'error' ? ERROR_DURATION_MS : SUCCESS_DURATION_MS;
    const timer = setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, timeoutMs);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      showSuccess,
      showError,
      dismiss,
    }),
    [showSuccess, showError, dismiss],
  );

  const isError = toast?.kind === 'error';

  return (
    <FeedbackContext.Provider value={value}>
      <View className="flex-1">
        {children}

        {toast ? (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: Math.max(12, insets.top + 8),
              left: 0,
              right: 0,
              zIndex: 100,
              elevation: 12,
              paddingHorizontal: 16,
              alignItems: 'center',
            }}
          >
            <View
              accessibilityRole={isError ? 'alert' : 'status'}
              accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
              style={
                Platform.OS === 'web'
                  ? {
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                    }
                  : {
                      shadowColor: theme.text,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.14,
                      shadowRadius: 12,
                      elevation: 6,
                    }
              }
              className={`w-full max-w-[480px] pl-4 pr-1.5 py-2 rounded-2xl border flex-row items-center gap-2.5 ${
                isError
                  ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-terracotta dark:border-ledger-terracotta-dark'
                  : 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-pine dark:border-ledger-pine-dark'
              }`}
            >
              <AppIcon
                name={isError ? 'warning' : 'checkCircle'}
                size={18}
                color={isError ? theme.negative : theme.positive}
              />
              <ThemedText
                className={`flex-1 text-xs font-semibold leading-4 ${
                  isError
                    ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                    : 'text-ledger-pine dark:text-ledger-pine-dark'
                }`}
              >
                {toast.message}
              </ThemedText>
              <Pressable
                onPress={dismiss}
                accessibilityRole="button"
                accessibilityLabel={
                  isError ? 'Dismiss error' : 'Dismiss notification'
                }
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                className="min-w-[44px] min-h-[44px] items-center justify-center rounded-xl active:opacity-75"
              >
                <AppIcon
                  name="close"
                  size={15}
                  color={isError ? theme.negative : theme.positive}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return ctx;
}
