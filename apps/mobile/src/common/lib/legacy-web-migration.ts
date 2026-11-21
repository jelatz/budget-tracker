import type { BackupEnvelope } from '@repo/contracts';

export function readUnmigratedLegacyWebBackup(_email: string): BackupEnvelope | null {
  return null;
}

export function markLegacyWebBackupMigrated(_email: string): void {
  // No-op on native platforms
}
