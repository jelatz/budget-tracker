import {
  backupEnvelopeSchema,
  normalizeBackupEnvelope,
  type BackupEnvelope,
} from '@repo/contracts';

const LEGACY_V3_KEY = 'budget_tracker_v3_state';
const LEGACY_V2_KEY = 'budget_tracker_v2_state';
const MIGRATED_OWNER_KEY = 'budget_tracker_v3_migrated_owner';

export function readUnmigratedLegacyWebBackup(email: string): BackupEnvelope | null {
  try {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
      return null;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const migratedOwner = globalThis.localStorage.getItem(MIGRATED_OWNER_KEY);
    if (migratedOwner) {
      // Never leak a prior browser user's un-scoped local ledger into a different user's account
      return null;
    }

    const raw =
      globalThis.localStorage.getItem(LEGACY_V3_KEY) ??
      globalThis.localStorage.getItem(LEGACY_V2_KEY);
    if (!raw) {
      return null;
    }

    const parsedJson = JSON.parse(raw) as unknown;
    const normalized = normalizeBackupEnvelope({
      version: 1,
      exportedAt: new Date().toISOString(),
      data: parsedJson,
    });
    const validated = backupEnvelopeSchema.safeParse(normalized);
    if (!validated.success || !normalizedEmail) {
      return null;
    }
    return validated.data;
  } catch (error: unknown) {
    return null;
  }
}

export function markLegacyWebBackupMigrated(email: string): void {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(MIGRATED_OWNER_KEY, email.trim().toLowerCase());
    }
  } catch (error: unknown) {
    // Ignore localStorage error
  }
}
