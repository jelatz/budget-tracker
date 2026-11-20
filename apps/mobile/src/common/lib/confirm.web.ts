export interface ConfirmActionOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * Prompts the user for confirmation on Web using window/globalThis.confirm.
 */
export async function confirmAction({
  title,
  message,
}: ConfirmActionOptions): Promise<boolean> {
  if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
    return globalThis.confirm(`${title}\n\n${message}`);
  }
  return false;
}
