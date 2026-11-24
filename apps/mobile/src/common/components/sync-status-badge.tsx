import { ActivityIndicator, Pressable } from 'react-native';
import { useTheme } from '@/common/hooks/use-theme';
import { syncNow, useSyncStatus } from '@/features/transactions/sync-engine';
import { AppIcon, type AppIconName } from './app-icon';
import { ThemedText } from './themed-text';

export interface SyncStatusBadgeProps {
  compact?: boolean;
}

export function SyncStatusBadge({ compact = false }: SyncStatusBadgeProps) {
  const theme = useTheme();
  const status = useSyncStatus();

  const isSyncing = status.phase === 'syncing';
  const isOffline = status.phase === 'offline';
  const isError = status.phase === 'error';
  const isSynced = status.phase === 'synced' && status.pendingCount === 0;

  let label = 'Tap to sync';
  let iconName: AppIconName = 'sync';
  let iconColor: string = theme.textSecondary;
  let containerClass =
    'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark';
  let textClass = 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary';

  if (isSyncing) {
    label = 'Syncing…';
    containerClass =
      'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft border-ledger-border dark:border-ledger-border-dark';
    iconColor = theme.info;
    textClass = 'text-ledger-teal dark:text-ledger-teal-dark';
  } else if (isOffline) {
    label =
      status.pendingCount > 0
        ? `Offline · ${status.pendingCount} pending`
        : compact
          ? 'Offline'
          : 'Offline (Cached)';
    iconName = 'offline';
    iconColor = theme.warning;
    containerClass =
      'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border-ledger-border dark:border-ledger-border-dark';
    textClass = 'text-ledger-ochre dark:text-ledger-ochre-dark';
  } else if (isError) {
    label = compact ? 'Sync retry' : 'Sync issue · Retry';
    iconName = 'warning';
    iconColor = theme.negative;
    containerClass =
      'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-border dark:border-ledger-border-dark';
    textClass = 'text-ledger-terracotta dark:text-ledger-terracotta-dark';
  } else if (isSynced) {
    label = compact ? 'Synced' : 'Cloud Synced';
    iconName = 'cloudDone';
    iconColor = theme.positive;
    containerClass =
      'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border-ledger-border dark:border-ledger-border-dark';
    textClass = 'text-ledger-pine dark:text-ledger-pine-dark';
  } else if (status.pendingCount > 0) {
    label = `${status.pendingCount} pending`;
  }

  return (
    <Pressable
      onPress={() => {
        void syncNow();
      }}
      disabled={isSyncing}
      accessibilityRole="button"
      accessibilityLabel={`Cloud sync status: ${label}. Tap to sync now.`}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      className={`min-h-[32px] px-2.5 py-1 rounded-full border flex-row items-center gap-1.5 active:opacity-75 ${containerClass}`}>
      {isSyncing ? (
        <ActivityIndicator size="small" color={theme.info} />
      ) : (
        <AppIcon name={iconName} size={13} color={iconColor} />
      )}
      <ThemedText className={`text-xs font-medium ${textClass}`} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
