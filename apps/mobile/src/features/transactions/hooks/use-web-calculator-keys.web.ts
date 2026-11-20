import { useEffect, useRef } from 'react';
import type { CalculatorKey } from '@repo/contracts';
import type { UseWebCalculatorKeysOptions } from './use-web-calculator-keys';

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') {
    return false;
  }
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.closest('[role="dialog"], [aria-modal="true"]')) {
    return true;
  }
  return false;
}

const DIGIT_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/**
 * Enables hardware keyboard input on Desktop Web for Fast Capture:
 * - Digits `0-9`, `.`
 * - Operators `+`, `-`, `*` (`×`), `/` (`÷`)
 * - `Backspace`, `Escape`/`c` (Clear), `=`
 * - `Enter`: evaluates pending operator or submits when ready
 */
export function useWebCalculatorKeys(options: UseWebCalculatorKeysOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const current = optionsRef.current;
      if (!current.enabled) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableEventTarget(event.target)) {
        return;
      }
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[role="dialog"], [aria-modal="true"]')
      ) {
        return;
      }

      const { key } = event;

      if (DIGIT_KEYS.has(key)) {
        event.preventDefault();
        current.onKeyPress(key as CalculatorKey);
        return;
      }

      switch (key) {
        case '.':
          event.preventDefault();
          current.onKeyPress('.');
          return;
        case '+':
          event.preventDefault();
          current.onKeyPress('+');
          return;
        case '-':
          event.preventDefault();
          current.onKeyPress('-');
          return;
        case '*':
        case 'x':
        case 'X':
          event.preventDefault();
          current.onKeyPress('×');
          return;
        case '/':
          event.preventDefault();
          current.onKeyPress('÷');
          return;
        case 'Backspace':
          event.preventDefault();
          current.onKeyPress('BACKSPACE');
          return;
        case 'Escape':
        case 'c':
        case 'C':
          event.preventDefault();
          current.onKeyPress('CLEAR');
          return;
        case '=':
          event.preventDefault();
          current.onKeyPress('=');
          return;
        case 'Enter':
          event.preventDefault();
          if (current.needsCalculation) {
            current.onKeyPress('=');
          } else if (current.canSave && !current.isSaving) {
            current.onSave();
          }
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
