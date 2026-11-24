import { ZodError } from 'zod';

/**
 * Extracts a clean human-readable error message from unknown errors,
 * unwrapping Zod validation issues instead of exposing raw JSON arrays.
 */
export function getUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    const firstIssue = error.issues.find((issue) => issue.message.trim().length > 0);
    return firstIssue ? firstIssue.message.trim() : fallback;
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback;
}
