import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import {
  mapKeyboardKeyToCalculatorKey,
  type TransactionType,
} from '@repo/contracts';

import { useTheme } from '@/common/hooks/use-theme';

import {
  getCalculatorFrameClassName,
  type CalculatorFocusFrameHandle,
  type CalculatorFocusFrameProps,
} from './calculator-frame-theme';

export type {
  CalculatorFocusFrameHandle,
  CalculatorFocusFrameProps,
} from './calculator-frame-theme';

const ACTIVE_RING_CLASSES: Record<TransactionType, string> = {
  EXPENSE: 'ring-4 ring-rose-500/15 dark:ring-rose-400/20',
  INCOME: 'ring-4 ring-emerald-500/15 dark:ring-emerald-400/20',
  TRANSFER: 'ring-4 ring-brand-500/15 dark:ring-brand-400/20',
};

export const CalculatorFocusFrame = forwardRef<
  CalculatorFocusFrameHandle,
  CalculatorFocusFrameProps
>(function CalculatorFocusFrame(
  {
    transactionType,
    needsCalculation,
    canSave,
    isFocused,
    onFocusChange,
    onKeyPress,
    onClearAll,
    onSave,
    ariaLabel = 'Amount calculator. Type numbers, operators, Backspace, Escape to clear, or Enter to calculate and save.',
    children,
  },
  ref,
) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isFocusVisible, setIsFocusVisible] = useState(false);

  const focusInput = () => {
    const input = inputRef.current;
    if (!input) return;
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    if (!isFocused) {
      onFocusChange(true);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const input = inputRef.current;
        if (!input) return;
        if (document.activeElement !== input) {
          input.focus({ preventScroll: true });
        }
        onFocusChange(true);
      },
    }),
    [onFocusChange],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input:not([readonly]), textarea')) {
      return;
    }
    e.preventDefault();
    setIsFocusVisible(false);
    focusInput();
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail > 0) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('input:not([readonly]), textarea')) {
        setIsFocusVisible(false);
        focusInput();
      }
    }
  };

  const handleFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    onFocusChange(true);
    try {
      setIsFocusVisible(e.target.matches(':focus-visible'));
    } catch {
      setIsFocusVisible(false);
    }
  };

  const handleBlurCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget as Node | null;
    if (containerRef.current && nextTarget && containerRef.current.contains(nextTarget)) {
      return;
    }
    setIsFocusVisible(false);
    onFocusChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter') {
      // Allow native keyboard-tabbed button activation if a keypad button itself holds focus.
      if (e.target !== inputRef.current) {
        return;
      }
      e.preventDefault();
      if (needsCalculation) {
        onKeyPress('=');
      } else if (canSave) {
        onSave();
      }
      return;
    }

    const mappedKey = mapKeyboardKeyToCalculatorKey(e.key);
    if (!mappedKey) {
      return;
    }

    e.preventDefault();
    if (mappedKey === 'CLEAR') {
      onClearAll();
    } else {
      onKeyPress(mappedKey);
    }
  };

  const baseFrameClass = getCalculatorFrameClassName(transactionType, isFocused);
  const frameClassName = isFocused
    ? `${baseFrameClass} ${ACTIVE_RING_CLASSES[transactionType]}`
    : `${baseFrameClass} hover:border-slate-400 dark:hover:border-slate-600`;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        cursor: 'text',
        borderRadius: 16,
        ...(isFocusVisible
          ? {
              outlineStyle: 'solid',
              outlineWidth: 2,
              outlineOffset: 3,
              outlineColor: theme.text,
            }
          : {}),
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        readOnly
        inputMode="none"
        aria-label={ariaLabel}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          padding: 0,
          margin: 0,
          border: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      <View className={frameClassName}>{children}</View>
    </div>
  );
});
