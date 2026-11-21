import { z } from 'zod';

export const destructiveConfirmationSchema = z.object({
  confirmAction: z.literal(true),
  confirmationToken: z.string().trim().min(1).max(160),
});
export type DestructiveConfirmation = z.infer<typeof destructiveConfirmationSchema>;

export type ConfirmationAction =
  | 'delete-account'
  | 'clear-transactions'
  | 'reconcile-account'
  | 'overwrite-backup'
  | 'reset-demo';

/**
 * Generates the deterministic human-in-the-loop confirmation token expected
 * by the API for irreversible or bulk-mutating operations.
 */
export function formatConfirmationToken(
  action: ConfirmationAction,
  targetId: string,
): string {
  return `${action}:${targetId.trim()}`;
}

export function createDestructiveConfirmation(
  action: ConfirmationAction,
  targetId: string,
): DestructiveConfirmation {
  return {
    confirmAction: true,
    confirmationToken: formatConfirmationToken(action, targetId),
  };
}

export function verifyConfirmationToken(
  confirmation: DestructiveConfirmation | undefined,
  action: ConfirmationAction,
  targetId: string,
): boolean {
  if (!confirmation || confirmation.confirmAction !== true) {
    return false;
  }
  return confirmation.confirmationToken === formatConfirmationToken(action, targetId);
}
