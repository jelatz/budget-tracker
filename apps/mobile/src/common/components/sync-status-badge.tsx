import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@/common/hooks/use-theme';
import { syncNow, useSyncStatus } from '@/features/transactions/sync-engine';
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
  let containerClass =
    'bg-slate-100 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80';
  let dotClass = 'bg-slate-400 dark:bg-slate-500';
  let textClass = 'text-slate-600 dark:text-slate-300';

  if (isSyncing) {
    label = 'Syncing…';
    containerClass =
      'bg-sky-50 dark:bg-sky-950/50 border-sky-200/80 dark:border-sky-800/70';
    textClass = 'text-sky-700 dark:text-sky-300';
  } else if (isOffline) {
    label =
      status.pendingCount > 0
        ? `Offline • ${status.pendingCount} pending`
        : compact
          ? 'Offline'
          : 'Offline (Cached)';
    containerClass =
      'bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/70';
    dotClass = 'bg-amber-500';
    textClass = 'text-amber-700 dark:text-amber-300';
  } else if (isError) {
    label = compact ? 'Sync retry' : 'Sync issue • Retry';
    containerClass =
      'bg-rose-50 dark:bg-rose-950/50 border-rose-200/80 dark:border-rose-800/70';
    dotClass = 'bg-rose-500';
    textClass = 'text-rose-700 dark:text-rose-300';
  } else if (isSynced) {
    label = compact ? 'Synced' : 'Cloud Synced';
    containerClass =
      'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/70';
    dotClass = 'bg-emerald-500';
    textClass = 'text-emerald-700 dark:text-emerald-300';
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
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      className={`px-2.5 py-1.5 rounded-full border flex-row items-center gap-1.5 active:opacity-75 ${containerClass}`}>
      {isSyncing ? (
        <ActivityIndicator size="small" color={theme.text} />
      ) : (
        <View className={`w-2 h-2 rounded-full ${dotClass}`} />
      )}
      <ThemedText className={`text-xs font-semibold ${textClass}`} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
