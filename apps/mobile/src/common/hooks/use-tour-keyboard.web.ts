import { useEffect } from 'react';
import type { UseTourKeyboardOptions } from './use-tour-keyboard';

export function useTourKeyboard({
  enabled,
  onNext,
  onBack,
  onClose,
}: UseTourKeyboardOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        onNext();
      } else if (event.key === 'ArrowLeft') {
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, onNext, onBack, onClose]);
}
