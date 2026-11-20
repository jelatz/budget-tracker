import type { CalculatorKey } from '@repo/contracts';

export interface UseWebCalculatorKeysOptions {
  enabled: boolean;
  needsCalculation: boolean;
  canSave: boolean;
  isSaving: boolean;
  onKeyPress: (key: CalculatorKey) => void;
  onSave: () => void;
}

/**
 * Native no-op counterpart to `use-web-calculator-keys.web.ts`.
 * Keeps DOM/window globals completely isolated from iOS/Android bundles.
 */
export function useWebCalculatorKeys(_options: UseWebCalculatorKeysOptions): void {
  // No hardware keyboard listener on native runtimes.
}
