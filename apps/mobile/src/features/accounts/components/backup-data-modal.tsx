import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  backupEnvelopeSchema,
  normalizeBackupEnvelope,
  serializeTransactionsToCsv,
  type BackupEnvelope,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { Fonts } from '@/common/constants/theme';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import {
  copyTextToClipboard,
  downloadTextFile,
  pickTextFile,
} from '@/common/lib/file-portability';
import { syncNow } from '@/features/transactions/sync-engine';
import {
  useAccounts,
  useAllCategories,
  useClearAllTransactions,
  useExportBackup,
  useImportBackup,
  useTransactions,
} from '@/features/transactions/hooks/use-transactions';

export interface BackupDataModalProps {
  visible: boolean;
  onClose: () => void;
}

type BackupTab = 'export' | 'restore';
type ImportMode = 'merge' | 'overwrite';

export function BackupDataModal({ visible, onClose }: BackupDataModalProps) {
  const theme = useTheme();
  const { showSuccess, showError } = useFeedback();
  const { width: windowWidth } = useWindowDimensions();
  const modalWidth = Math.min(Math.max(windowWidth - 28, 280), 600);

  const [tab, setTab] = useState<BackupTab>('export');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [jsonInput, setJsonInput] = useState('');
  const [validatedBackup, setValidatedBackup] = useState<BackupEnvelope | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const { data: accounts = [] } = useAccounts();
  const { categories } = useAllCategories();
  const { data: transactions = [] } = useTransactions();
  const exportMutation = useExportBackup();
  const importMutation = useImportBackup();
  const clearAllMutation = useClearAllTransactions();

  const handleExportJson = async (action: 'download' | 'copy') => {
    setErrorMsg(null);
    try {
      const envelope = await exportMutation.mutateAsync();
      const text = JSON.stringify(envelope, null, 2);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (action === 'download' && downloadTextFile(text, `budget-tracker-${stamp}.json`, 'application/json')) {
        showSuccess(`Downloaded budget-tracker-${stamp}.json`);
      } else {
        const copied = await copyTextToClipboard(text);
        showSuccess(copied ? 'JSON backup copied to clipboard.' : 'JSON backup prepared.');
      }
    } catch (error: unknown) {
      setErrorMsg(getUserErrorMessage(error, 'Failed to export JSON backup.'));
    }
  };

  const handleExportCsv = async (action: 'download' | 'copy') => {
    setErrorMsg(null);
    try {
      const csv = serializeTransactionsToCsv(transactions, categories, accounts);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (action === 'download' && downloadTextFile(csv, `budget-tracker-${stamp}.csv`, 'text/csv;charset=utf-8;')) {
        showSuccess(`Downloaded budget-tracker-${stamp}.csv`);
      } else {
        const copied = await copyTextToClipboard(csv);
        showSuccess(copied ? 'CSV copied to clipboard.' : 'CSV prepared.');
      }
    } catch (error: unknown) {
      setErrorMsg(getUserErrorMessage(error, 'Failed to export CSV.'));
    }
  };

  const handlePickJsonFile = async () => {
    const picked = await pickTextFile('.json,application/json');
    if (!picked) return;
    setJsonInput(picked.content);
    setValidatedBackup(null);
    setErrorMsg(null);
    showSuccess(`Loaded ${picked.name}`);
  };

  const handleValidateJson = () => {
    setErrorMsg(null);
    setValidatedBackup(null);
    const trimmed = jsonInput.trim();
    if (!trimmed) {
      setErrorMsg('Paste or select a JSON backup file first.');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const result = backupEnvelopeSchema.safeParse(normalizeBackupEnvelope(parsed));
      if (!result.success) {
        setErrorMsg(
          `Invalid backup file: ${result.error.issues
            .slice(0, 2)
            .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
            .join('; ')}`,
        );
        return;
      }
      setValidatedBackup(result.data);
      showSuccess('Backup validated and ready to restore.');
    } catch (error: unknown) {
      setErrorMsg(getUserErrorMessage(error, 'Invalid JSON syntax.'));
    }
  };

  const handleRestore = async () => {
    if (!validatedBackup) return;
    setErrorMsg(null);
    try {
      const res = await importMutation.mutateAsync({
        rawEnvelope: validatedBackup,
        mode: importMode,
      });
      await syncNow();
      setValidatedBackup(null);
      setJsonInput('');
      showSuccess(`Restored ${res.importedCount} entries.`);
      onClose();
    } catch (error: unknown) {
      const msg = getUserErrorMessage(error, 'Could not restore backup.');
      setErrorMsg(msg);
      showError(msg);
    }
  };

  const handleClearAll = async () => {
    setErrorMsg(null);
    try {
      await clearAllMutation.mutateAsync();
      setConfirmClearAll(false);
      showSuccess('Cleared all recorded ledger entries.');
    } catch (error: unknown) {
      setErrorMsg(getUserErrorMessage(error, 'Could not clear entries.'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView
        className="flex-1 bg-black/50"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1 items-center justify-center p-4"
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            className="absolute inset-0"
          />

          <View
            style={{ width: modalWidth, maxHeight: '90%' }}
            className="relative z-10 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 20, gap: 16 }}
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <ThemedText
                    accessibilityRole="header"
                    className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    Backup &amp; Data
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Export JSON/CSV or restore from a saved backup
                  </ThemedText>
                </View>

                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                >
                  <AppIcon name="close" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              {/* Tabs */}
              <View className="flex-row p-1 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-1">
                {(['export', 'restore'] as const).map((t) => {
                  const selected = tab === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setTab(t);
                        setErrorMsg(null);
                      }}
                      accessibilityRole="tab"
                      accessibilityLabel={t === 'export' ? 'Export Data' : 'Restore Data'}
                      accessibilityState={{ selected }}
                      className={`flex-1 min-h-[44px] rounded-lg items-center justify-center ${
                        selected
                          ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                          : ''
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-bold ${
                          selected
                            ? 'text-ledger-ink dark:text-ledger-ink-dark'
                            : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                        }`}
                      >
                        {t === 'export' ? 'Export & Reset' : 'Restore JSON'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {errorMsg ? (
                <View
                  accessibilityRole="alert"
                  className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                >
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    {errorMsg}
                  </ThemedText>
                </View>
              ) : null}

              {tab === 'export' ? (
                <View className="gap-4">
                  <View className="p-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2.5">
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Full Ledger Backup (JSON)
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Includes accounts, debts, payday schedules, and all entries.
                    </ThemedText>
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => void handleExportJson('download')}
                        accessibilityRole="button"
                        accessibilityLabel="Download JSON Backup"
                        className="flex-1 min-h-[44px] px-3 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                          Download JSON
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleExportJson('copy')}
                        accessibilityRole="button"
                        accessibilityLabel="Copy JSON Backup"
                        className="flex-1 min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Copy JSON
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  <View className="p-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2.5">
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Spreadsheet Export (CSV)
                    </ThemedText>
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => void handleExportCsv('download')}
                        accessibilityRole="button"
                        accessibilityLabel="Download CSV"
                        className="flex-1 min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Download CSV
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleExportCsv('copy')}
                        accessibilityRole="button"
                        accessibilityLabel="Copy CSV"
                        className="flex-1 min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Copy CSV
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>

                  <View className="p-4 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-2.5">
                    <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      Danger Zone · Clear All Entries
                    </ThemedText>
                    {!confirmClearAll ? (
                      <Pressable
                        onPress={() => setConfirmClearAll(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Clear all transactions"
                        className="min-h-[44px] px-4 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                          Clear All Transactions
                        </ThemedText>
                      </Pressable>
                    ) : (
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => setConfirmClearAll(false)}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel clear entries"
                          className="flex-1 min-h-[44px] rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleClearAll()}
                          disabled={clearAllMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel="Confirm clear all entries"
                          className="flex-1 min-h-[44px] rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                            Confirm Clear
                          </ThemedText>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View className="gap-3">
                  <View className="flex-row gap-2">
                    {(['merge', 'overwrite'] as const).map((m) => {
                      const selected = importMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setImportMode(m)}
                          accessibilityRole="button"
                          accessibilityLabel={m === 'merge' ? 'Merge backup' : 'Overwrite with backup'}
                          accessibilityState={{ selected }}
                          className={`flex-1 min-h-[44px] rounded-xl border items-center justify-center ${
                            selected
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold ${
                              selected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                            }`}
                          >
                            {m === 'merge' ? 'Merge Into Current' : 'Overwrite All'}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>

                  {Platform.OS === 'web' && (
                    <Pressable
                      onPress={() => void handlePickJsonFile()}
                      accessibilityRole="button"
                      accessibilityLabel="Choose JSON Backup File"
                      className="min-h-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Choose .json File
                      </ThemedText>
                    </Pressable>
                  )}

                  <TextInput
                    value={jsonInput}
                    onChangeText={(text) => {
                      setJsonInput(text);
                      setValidatedBackup(null);
                    }}
                    placeholder="Paste JSON backup content here..."
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="JSON backup text"
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    style={{ fontFamily: Fonts?.mono }}
                    className="min-h-[120px] p-3 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-xs text-ledger-ink dark:text-ledger-ink-dark"
                  />

                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={handleValidateJson}
                      accessibilityRole="button"
                      accessibilityLabel="Validate JSON Backup"
                      className="flex-1 min-h-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Validate JSON
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => void handleRestore()}
                      disabled={!validatedBackup || importMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Restore Backup"
                      className={`flex-1 min-h-[44px] rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center ${
                        !validatedBackup || importMutation.isPending ? 'opacity-45' : ''
                      }`}
                    >
                      {importMutation.isPending ? (
                        <ActivityIndicator size="small" color={theme.onPrimary} />
                      ) : (
                        <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                          Restore Now
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
