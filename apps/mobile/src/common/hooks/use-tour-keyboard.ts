export interface UseTourKeyboardOptions {
  enabled: boolean;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}

export function useTourKeyboard(_options: UseTourKeyboardOptions): void {
  // Keyboard shortcuts are only attached on Web.
}
