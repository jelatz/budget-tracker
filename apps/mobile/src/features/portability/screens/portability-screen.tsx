import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  backupEnvelopeSchema,
  DEFAULT_CURRENCY,
  normalizeBackupEnvelope,
  parseTransactionsFromCsv,
  serializeTransactionsToCsv,
  type BackupEnvelope,
  type ParseTransactionsCsvResult,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { SyncStatusBadge } from '@/common/components/sync-status-badge';
import { ThemedText } from '@/common/components/themed-text';
import {
  BottomTabInset,
  Fonts,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import {
  copyTextToClipboard,
  downloadTextFile,
  pickTextFile,
} from '@/common/lib/file-portability';
import { syncNow, useSyncStatus } from '@/features/transactions/sync-engine';
import {
  useAccounts,
  useAllCategories,
  useBatchCreateTransactions,
  useClearAllTransactions,
  useExportBackup,
  useImportBackup,
  useTransactions,
} from '@/features/transactions/hooks/use-transactions';

type PortabilityTab = 'export' | 'import';
type ImportFormat = 'json' | 'csv';
type ImportMode = 'merge' | 'overwrite';

export function PortabilityScreen() {
  const { isAuthenticated, user } = useRequireAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;

  const syncStatus = useSyncStatus();
  const [activeTab, setActiveTab] = useState<PortabilityTab>('export');
  const [importFormat, setImportFormat] = useState<ImportFormat>('json');
  const [importMode, setImportMode] = useState<ImportMode>('merge');

  // Queries & Mutations
  const { data: accounts = [] } = useAccounts();
  const { categories } = useAllCategories();
  const { data: transactions = [] } = useTransactions();

  const exportBackupMutation = useExportBackup();
  const importBackupMutation = useImportBackup();
  const batchCreateMutation = useBatchCreateTransactions();
  const clearAllMutation = useClearAllTransactions();

  // Inputs & Previews
  const [jsonInput, setJsonInput] = useState<string>('');
  const [csvInput, setCsvInput] = useState<string>('');

  const [validatedBackup, setValidatedBackup] = useState<BackupEnvelope | null>(null);
  const [csvPreviewResult, setCsvPreviewResult] = useState<ParseTransactionsCsvResult | null>(null);

  // Notifications & Confirmations
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  // File Download Helper
  const downloadFile = async (content: string, filename: string, mimeType: string) => {
    if (downloadTextFile(content, filename, mimeType)) {
      setToastMessage(`Downloaded ${filename}`);
    } else {
      await copyToClipboard(content, filename);
    }
  };

  // Clipboard Helper
  const copyToClipboard = async (text: string, label: string) => {
    const copied = await copyTextToClipboard(text);
    setToastMessage(copied ? `${label} copied to clipboard` : `${label} ready`);
  };

  // File Upload Handler (Web)
  const handleSelectFile = async (format: 'json' | 'csv') => {
    const accept = format === 'json' ? '.json,application/json' : '.csv,text/csv,text/plain';
    const picked = await pickTextFile(accept);
    if (!picked) {
      return;
    }
    if (format === 'json') {
      setJsonInput(picked.content);
      setValidatedBackup(null);
    } else {
      setCsvInput(picked.content);
      setCsvPreviewResult(null);
    }
    setToastMessage(`Loaded file: ${picked.name}`);
  };

  // Export Handlers
  const handleExportJson = async (action: 'download' | 'copy') => {
    setErrorMessage(null);
    try {
      const backupData = await exportBackupMutation.mutateAsync();
      const jsonString = JSON.stringify(backupData, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (action === 'download') {
        await downloadFile(jsonString, `budget-tracker-backup-${timestamp}.json`, 'application/json');
      } else {
        await copyToClipboard(jsonString, 'Full JSON Backup');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to export backup.');
    }
  };

  const handleExportCsv = async (action: 'download' | 'copy') => {
    setErrorMessage(null);
    try {
      const csvString = serializeTransactionsToCsv(transactions, categories, accounts);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (action === 'download') {
        await downloadFile(
          csvString,
          `budget-tracker-transactions-${timestamp}.csv`,
          'text/csv;charset=utf-8;',
        );
      } else {
        await copyToClipboard(csvString, 'Transactions CSV');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to export CSV.');
    }
  };

  // JSON Import Handlers
  const handleValidateJson = () => {
    setErrorMessage(null);
    setValidatedBackup(null);

    const trimmed = jsonInput.trim();
    if (!trimmed) {
      setErrorMessage('Please paste or select a JSON backup file to validate.');
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const parseResult = backupEnvelopeSchema.safeParse(normalizeBackupEnvelope(parsed));
      if (!parseResult.success) {
        const issueDescriptions = parseResult.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .slice(0, 4)
          .join('\n');
        setErrorMessage(`Invalid backup envelope format:\n${issueDescriptions}`);
        return;
      }
      setValidatedBackup(parseResult.data);
      setToastMessage('Backup verified and ready to restore');
    } catch (err: unknown) {
      setErrorMessage(
        `JSON Syntax Error: ${err instanceof Error ? err.message : 'Could not parse JSON string'}`,
      );
    }
  };

  const handleConfirmRestoreJson = async () => {
    if (!validatedBackup) return;
    setErrorMessage(null);

    try {
      const result = await importBackupMutation.mutateAsync({
        rawEnvelope: validatedBackup,
        mode: importMode,
      });

      setToastMessage(
        `Backup restored (${result.importedCount} transactions ${
          importMode === 'overwrite' ? 'replaced' : 'merged'
        })`,
      );
      setValidatedBackup(null);
      setJsonInput('');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to restore backup.');
    }
  };

  // CSV Import Handlers
  const handlePreviewCsv = () => {
    setErrorMessage(null);
    setCsvPreviewResult(null);

    const trimmed = csvInput.trim();
    if (!trimmed) {
      setErrorMessage('Please paste or select CSV text to preview.');
      return;
    }

    try {
      const result = parseTransactionsFromCsv(trimmed, accounts, categories);
      setCsvPreviewResult(result);

      if (result.valid.length === 0 && result.errors.length > 0) {
        setErrorMessage(
          `Could not parse any valid transactions:\n${result.errors.slice(0, 3).join('\n')}`,
        );
      } else {
        setToastMessage(`CSV preview generated: ${result.valid.length} valid transactions`);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse CSV.');
    }
  };

  const handleImportCsvTransactions = async () => {
    if (!csvPreviewResult || csvPreviewResult.valid.length === 0) return;
    setErrorMessage(null);

    try {
      const created = await batchCreateMutation.mutateAsync(csvPreviewResult.valid);
      setToastMessage(`Imported ${created.length} transactions from CSV`);
      setCsvPreviewResult(null);
      setCsvInput('');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import CSV transactions.');
    }
  };

  // Reset Data Handler
  const handleConfirmResetData = async () => {
    setErrorMessage(null);
    try {
      await clearAllMutation.mutateAsync();
      setConfirmingClearAll(false);
      setToastMessage('All recorded transactions cleared.');
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to reset entries. Please try again.',
      );
    }
  };

  // Sample CSV generator for user convenience
  const handleLoadCsvTemplate = () => {
    const sampleAccountName = accounts[0]?.name ?? 'Main Bank';
    const sampleCategoryName = categories.find((c) => c.type === 'EXPENSE')?.name ?? 'Groceries';
    const template = [
      'Date,Type,Amount,Currency,Account,ToAccount,Category,Merchant,Notes,Tags',
      `2026-11-01,EXPENSE,45.50,${DEFAULT_CURRENCY},"${sampleAccountName}",,"${sampleCategoryName}","Supermarket","Weekly groceries","food;home"`,
      `2026-11-01,INCOME,2500.00,${DEFAULT_CURRENCY},"${sampleAccountName}",,"Salary","Employer","Direct deposit","paycheck"`,
    ].join('\n');
    setCsvInput(template);
    setCsvPreviewResult(null);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Mobile / Standalone Top Bar Header (hidden when Desktop sidebar is visible) */}
          {!isDesktopWeb && (
            <View className="px-4 py-3 border-b border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-surface-dark">
              <View className="flex-row items-center justify-between gap-2">
                <Pressable
                  onPress={() => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace('/dashboard');
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75 flex-row items-center gap-1.5"
                >
                  <AppIcon name="back" size={16} color={theme.text} />
                  <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                    Back
                  </ThemedText>
                </Pressable>

                <View className="items-center flex-1 px-1">
                  <ThemedText
                    accessibilityRole="header"
                    className="text-base font-extrabold text-ledger-ink dark:text-ledger-ink-dark text-center"
                    numberOfLines={1}
                  >
                    Backup & Export
                  </ThemedText>
                  <ThemedText
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center"
                    numberOfLines={1}
                  >
                    Snapshots, CSV reports & restore
                  </ThemedText>
                </View>

                <View className="w-16" />
              </View>
            </View>
          )}

          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              width: '100%',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: Math.max(96, BottomTabInset + 32),
              gap: 18,
              ...(Platform.OS === 'web'
                ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
                : {}),
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Desktop Web Editorial Header */}
            {isDesktopWeb && (
              <View className="gap-0.5">
                <ThemedText
                  accessibilityRole="header"
                  className="text-[28px] leading-9 font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  Backup & Export
                </ThemedText>
                <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Export snapshots, CSV spreadsheets, or restore from backups
                </ThemedText>
              </View>
            )}

            {/* Non-blocking Success Toast Banner */}
            {toastMessage && (
              <View className="px-4 py-3 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2.5">
                <AppIcon name="checkCircle" size={16} color={theme.positive} />
                <ThemedText className="flex-1 text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
                  {toastMessage}
                </ThemedText>
                <Pressable
                  onPress={() => setToastMessage(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                  className="min-w-[44px] min-h-[44px] items-center justify-center active:opacity-75"
                >
                  <AppIcon name="close" size={15} color={theme.positive} />
                </Pressable>
              </View>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <View
                accessibilityRole="alert"
                className="px-4 py-3 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2.5"
              >
                <AppIcon name="warning" size={16} color={theme.negative} />
                <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  {errorMessage}
                </ThemedText>
                <Pressable
                  onPress={() => setErrorMessage(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss error"
                  className="min-w-[44px] min-h-[44px] items-center justify-center active:opacity-75"
                >
                  <AppIcon name="close" size={15} color={theme.negative} />
                </Pressable>
              </View>
            )}

            {/* Cloud Sync Status Card */}
            <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5">
              <View className="flex-row items-start justify-between flex-wrap gap-3">
                <View className="flex-1 min-w-[140px] gap-0.5">
                  <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                    Cloud Sync
                  </ThemedText>
                  <ThemedText className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {user?.email ? `Signed in as ${user.email}` : 'Multi-device sync'}
                  </ThemedText>
                </View>
                <SyncStatusBadge />
              </View>

              <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1 pt-2.5 border-t border-ledger-border dark:border-ledger-border-dark">
                <ThemedText className="text-xs font-mono text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Rev #{syncStatus.serverRevision}
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  ·
                </ThemedText>
                <ThemedText
                  numeric
                  className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                >
                  {syncStatus.pendingCount} pending offline changes
                </ThemedText>
                {syncStatus.lastSyncedAt ? (
                  <>
                    <ThemedText className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      ·
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Last synced {new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}
                    </ThemedText>
                  </>
                ) : null}
              </View>

              {syncStatus.errorMessage ? (
                <ThemedText
                  accessibilityRole="alert"
                  className="text-xs font-medium text-ledger-terracotta dark:text-ledger-terracotta-dark"
                >
                  {syncStatus.errorMessage}
                </ThemedText>
              ) : null}

              <Pressable
                onPress={() => {
                  void syncNow();
                }}
                disabled={syncStatus.phase === 'syncing'}
                accessibilityRole="button"
                accessibilityLabel="Sync Now"
                className={`min-h-[44px] py-3 px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-2 ${
                  syncStatus.phase === 'syncing' ? 'opacity-70' : ''
                }`}
              >
                {syncStatus.phase === 'syncing' ? (
                  <ActivityIndicator color={theme.onPrimary} size="small" />
                ) : (
                  <>
                    <AppIcon name="sync" size={15} color={theme.onPrimary} />
                    <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                      Sync Now
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </View>

            {/* Main Section Selector Tabs: [ Export ] vs [ Import ] */}
            <View className="flex-row rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark p-1 gap-1">
              <Pressable
                onPress={() => {
                  setActiveTab('export');
                  setErrorMessage(null);
                }}
                accessibilityRole="tab"
                accessibilityLabel="Export Data"
                accessibilityState={{ selected: activeTab === 'export' }}
                className={`flex-1 min-h-[44px] rounded-lg flex-row items-center justify-center gap-1.5 ${
                  activeTab === 'export'
                    ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                    : 'border border-transparent active:opacity-75'
                }`}
              >
                <AppIcon
                  name="export"
                  size={15}
                  color={activeTab === 'export' ? theme.text : theme.textSecondary}
                />
                <ThemedText
                  className={`text-sm font-bold ${
                    activeTab === 'export'
                      ? 'text-ledger-ink dark:text-ledger-ink-dark'
                      : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                  }`}
                >
                  Export Data
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setActiveTab('import');
                  setErrorMessage(null);
                }}
                accessibilityRole="tab"
                accessibilityLabel="Import Data"
                accessibilityState={{ selected: activeTab === 'import' }}
                className={`flex-1 min-h-[44px] rounded-lg flex-row items-center justify-center gap-1.5 ${
                  activeTab === 'import'
                    ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                    : 'border border-transparent active:opacity-75'
                }`}
              >
                <AppIcon
                  name="import"
                  size={15}
                  color={activeTab === 'import' ? theme.text : theme.textSecondary}
                />
                <ThemedText
                  className={`text-sm font-bold ${
                    activeTab === 'import'
                      ? 'text-ledger-ink dark:text-ledger-ink-dark'
                      : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                  }`}
                >
                  Import Data
                </ThemedText>
              </Pressable>
            </View>

            {/* ============================================================== */}
            {/* EXPORT SECTION */}
            {/* ============================================================== */}
            {activeTab === 'export' && (
              <View className="gap-4">
                {/* 1. Full JSON Backup Card */}
                <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
                      <AppIcon name="portability" size={20} color={theme.primary} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Full JSON Backup
                      </ThemedText>
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                        Complete snapshot of accounts, categories, transactions, envelopes, bills,
                        sinking funds, and presets
                      </ThemedText>
                    </View>
                  </View>

                  <View className="pt-2.5 border-t border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText
                      numeric
                      className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} ·{' '}
                      {categories.length} {categories.length === 1 ? 'category' : 'categories'} ·{' '}
                      {transactions.length}{' '}
                      {transactions.length === 1 ? 'transaction' : 'transactions'}
                    </ThemedText>
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row flex-wrap gap-2.5">
                    <Pressable
                      onPress={() => handleExportJson('download')}
                      disabled={exportBackupMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Export JSON Backup"
                      className="flex-1 min-w-[160px] min-h-[44px] py-2.5 px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-1.5"
                    >
                      {exportBackupMutation.isPending ? (
                        <ActivityIndicator color={theme.onPrimary} size="small" />
                      ) : (
                        <>
                          <AppIcon name="export" size={15} color={theme.onPrimary} />
                          <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                            Export JSON Backup
                          </ThemedText>
                        </>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => handleExportJson('copy')}
                      disabled={exportBackupMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Copy JSON backup to clipboard"
                      className="min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                    >
                      <AppIcon name="copy" size={14} color={theme.textSecondary} />
                      <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Copy to Clipboard
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* 2. Transactions CSV Card */}
                <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
                      <AppIcon name="chart" size={20} color={theme.positive} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Transactions CSV
                      </ThemedText>
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                        Spreadsheet-ready CSV compatible with Excel, Google Sheets, and Numbers
                      </ThemedText>
                    </View>
                  </View>

                  <View className="pt-2.5 border-t border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText
                      numeric
                      className="text-xs font-medium text-ledger-pine dark:text-ledger-pine-dark"
                    >
                      {transactions.length}{' '}
                      {transactions.length === 1 ? 'transaction' : 'transactions'} ready to export
                    </ThemedText>
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row flex-wrap gap-2.5">
                    <Pressable
                      onPress={() => handleExportCsv('download')}
                      accessibilityRole="button"
                      accessibilityLabel="Export Transactions CSV"
                      className="flex-1 min-w-[160px] min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-pine active:opacity-90 dark:bg-ledger-pine-dark flex-row items-center justify-center gap-1.5"
                    >
                      <AppIcon name="export" size={15} color={theme.onPrimary} />
                      <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                        Export Transactions CSV
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => handleExportCsv('copy')}
                      accessibilityRole="button"
                      accessibilityLabel="Copy CSV to clipboard"
                      className="min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
                    >
                      <AppIcon name="copy" size={14} color={theme.textSecondary} />
                      <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Copy to Clipboard
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* ============================================================== */}
            {/* IMPORT SECTION */}
            {/* ============================================================== */}
            {activeTab === 'import' && (
              <View className="gap-4">
                {/* Format Selector: [ JSON Backup ] | [ Transactions CSV ] */}
                <View className="flex-row rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark p-1 gap-1">
                  <Pressable
                    onPress={() => {
                      setImportFormat('json');
                      setErrorMessage(null);
                    }}
                    accessibilityRole="tab"
                    accessibilityLabel="JSON Backup format"
                    accessibilityState={{ selected: importFormat === 'json' }}
                    className={`flex-1 min-h-[44px] rounded-lg items-center justify-center ${
                      importFormat === 'json'
                        ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                        : 'border border-transparent active:opacity-75'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        importFormat === 'json'
                          ? 'text-brand-500 dark:text-brand-400'
                          : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                      }`}
                    >
                      JSON Backup
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setImportFormat('csv');
                      setErrorMessage(null);
                    }}
                    accessibilityRole="tab"
                    accessibilityLabel="Transactions CSV format"
                    accessibilityState={{ selected: importFormat === 'csv' }}
                    className={`flex-1 min-h-[44px] rounded-lg items-center justify-center ${
                      importFormat === 'csv'
                        ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                        : 'border border-transparent active:opacity-75'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        importFormat === 'csv'
                          ? 'text-brand-500 dark:text-brand-400'
                          : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                      }`}
                    >
                      Transactions CSV
                    </ThemedText>
                  </Pressable>
                </View>

                {/* ---------------------------------------------------------- */}
                {/* JSON BACKUP IMPORT */}
                {/* ---------------------------------------------------------- */}
                {importFormat === 'json' && (
                  <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <View className="gap-0.5 flex-1 min-w-[180px]">
                        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Restore JSON Backup
                        </ThemedText>
                        <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                          Paste backup payload or select a file
                        </ThemedText>
                      </View>

                      {Platform.OS === 'web' && (
                        <Pressable
                          onPress={() => handleSelectFile('json')}
                          accessibilityRole="button"
                          accessibilityLabel="Choose JSON backup file"
                          className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark active:opacity-75 border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5"
                        >
                          <AppIcon name="file" size={14} color={theme.textSecondary} />
                          <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                            Choose File
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>

                    {/* Multiline JSON Text Area */}
                    <View className="relative">
                      <TextInput
                        multiline
                        numberOfLines={8}
                        value={jsonInput}
                        onChangeText={(txt) => {
                          setJsonInput(txt);
                          setValidatedBackup(null);
                        }}
                        placeholder={`{\n  "version": 1,\n  "exportedAt": "...",\n  "data": { ... }\n}`}
                        placeholderTextColor={theme.textMuted}
                        accessibilityLabel="JSON backup payload"
                        style={{
                          minHeight: 140,
                          textAlignVertical: 'top',
                          fontFamily: Fonts.mono,
                        }}
                        className="w-full p-3.5 text-xs rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark"
                      />
                      {jsonInput.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setJsonInput('');
                            setValidatedBackup(null);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Clear JSON input"
                          className="absolute top-2 right-2 min-h-[44px] px-3 rounded-lg bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                            Clear
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>

                    {/* Mode Selection */}
                    <View className="gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                      <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        Restore Strategy
                      </ThemedText>

                      <View className="flex-row gap-3">
                        <Pressable
                          onPress={() => setImportMode('merge')}
                          accessibilityRole="button"
                          accessibilityLabel="Merge strategy"
                          accessibilityState={{ selected: importMode === 'merge' }}
                          className={`flex-1 min-h-[44px] p-3.5 rounded-xl border ${
                            importMode === 'merge'
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold mb-1 ${
                              importMode === 'merge'
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            Merge (Recommended)
                          </ThemedText>
                          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                            Keep existing data and append new records, deduplicating by ID.
                          </ThemedText>
                        </Pressable>

                        <Pressable
                          onPress={() => setImportMode('overwrite')}
                          accessibilityRole="button"
                          accessibilityLabel="Overwrite strategy"
                          accessibilityState={{ selected: importMode === 'overwrite' }}
                          className={`flex-1 min-h-[44px] p-3.5 rounded-xl border ${
                            importMode === 'overwrite'
                              ? 'bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border-ledger-terracotta dark:border-ledger-terracotta-dark'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold mb-1 ${
                              importMode === 'overwrite'
                                ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            Overwrite (Full Replace)
                          </ThemedText>
                          <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                            Wipe all existing data and restore exactly what is in this backup.
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>

                    {/* Validate Button */}
                    {!validatedBackup && (
                      <Pressable
                        onPress={handleValidateJson}
                        accessibilityRole="button"
                        accessibilityLabel="Validate Backup"
                        className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-2"
                      >
                        <AppIcon name="search" size={15} color={theme.onPrimary} />
                        <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                          Validate Backup
                        </ThemedText>
                      </Pressable>
                    )}

                    {/* Validated Summary Preview */}
                    {validatedBackup && (
                      <View className="p-4 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-3">
                        <View className="flex-row items-center gap-2">
                          <AppIcon name="checkCircle" size={16} color={theme.positive} />
                          <ThemedText className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark">
                            Backup verified and ready to restore
                          </ThemedText>
                        </View>

                        <ThemedText
                          numeric
                          className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                        >
                          {validatedBackup.data.accounts.length} accounts ·{' '}
                          {validatedBackup.data.categories.length} categories ·{' '}
                          {validatedBackup.data.transactions.length} transactions ·{' '}
                          {validatedBackup.data.categoryBudgets.length} envelopes ·{' '}
                          {validatedBackup.data.recurringCommitments.length} bills ·{' '}
                          {validatedBackup.data.sinkingFunds.length} sinking funds
                        </ThemedText>

                        {/* Confirm & Restore Action */}
                        <Pressable
                          onPress={handleConfirmRestoreJson}
                          disabled={importBackupMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={
                            importMode === 'overwrite'
                              ? 'Confirm and overwrite all data'
                              : 'Confirm and merge backup'
                          }
                          className={`w-full min-h-[44px] py-3 px-4 rounded-xl flex-row items-center justify-center gap-2 ${
                            importMode === 'overwrite'
                              ? 'bg-ledger-terracotta dark:bg-ledger-terracotta-dark active:opacity-85'
                              : 'bg-brand-500 active:bg-brand-600 dark:bg-brand-400'
                          }`}
                        >
                          {importBackupMutation.isPending ? (
                            <ActivityIndicator color={theme.onPrimary} size="small" />
                          ) : (
                            <>
                              <AppIcon
                                name={importMode === 'overwrite' ? 'warning' : 'checkCircle'}
                                size={15}
                                color={theme.onPrimary}
                              />
                              <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                                {importMode === 'overwrite'
                                  ? 'Confirm & Overwrite All Data'
                                  : 'Confirm & Restore (Merge)'}
                              </ThemedText>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}

                {/* ---------------------------------------------------------- */}
                {/* CSV IMPORT */}
                {/* ---------------------------------------------------------- */}
                {importFormat === 'csv' && (
                  <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-4">
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <View className="gap-0.5 flex-1 min-w-[160px]">
                        <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Import Transactions CSV
                        </ThemedText>
                        <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                          Paste CSV table or select a file
                        </ThemedText>
                      </View>

                      <View className="flex-row flex-wrap gap-2">
                        <Pressable
                          onPress={handleLoadCsvTemplate}
                          accessibilityRole="button"
                          accessibilityLabel="Load sample CSV template"
                          className="min-h-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark active:opacity-75 border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                            Sample Template
                          </ThemedText>
                        </Pressable>

                        {Platform.OS === 'web' && (
                          <Pressable
                            onPress={() => handleSelectFile('csv')}
                            accessibilityRole="button"
                            accessibilityLabel="Choose CSV file"
                            className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark active:opacity-75 border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5"
                          >
                            <AppIcon name="file" size={14} color={theme.textSecondary} />
                            <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                              Choose File
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* Multiline CSV Text Area */}
                    <View className="relative">
                      <TextInput
                        multiline
                        numberOfLines={8}
                        value={csvInput}
                        onChangeText={(txt) => {
                          setCsvInput(txt);
                          setCsvPreviewResult(null);
                        }}
                        placeholder={`Date,Type,Amount,Currency,Account,ToAccount,Category,Merchant,Notes,Tags\n2026-11-01,EXPENSE,45.50,${DEFAULT_CURRENCY},"Main Bank",,"Groceries","Supermarket","Dinner groceries","food"`}
                        placeholderTextColor={theme.textMuted}
                        accessibilityLabel="CSV transactions input"
                        style={{
                          minHeight: 140,
                          textAlignVertical: 'top',
                          fontFamily: Fonts.mono,
                        }}
                        className="w-full p-3.5 text-xs rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark"
                      />
                      {csvInput.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setCsvInput('');
                            setCsvPreviewResult(null);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Clear CSV input"
                          className="absolute top-2 right-2 min-h-[44px] px-3 rounded-lg bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                            Clear
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>

                    {/* Preview CSV Button */}
                    {!csvPreviewResult && (
                      <Pressable
                        onPress={handlePreviewCsv}
                        accessibilityRole="button"
                        accessibilityLabel="Preview CSV Transactions"
                        className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-2"
                      >
                        <AppIcon name="search" size={15} color={theme.onPrimary} />
                        <ThemedText className="text-ledger-canvas dark:text-brand-900 text-xs font-bold">
                          Preview CSV Transactions
                        </ThemedText>
                      </Pressable>
                    )}

                    {/* CSV Parse Results */}
                    {csvPreviewResult && (
                      <View className="gap-3">
                        {/* Errors summary if any */}
                        {csvPreviewResult.errors.length > 0 && (
                          <View className="p-3.5 rounded-2xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-1.5">
                            <View className="flex-row items-center gap-1.5">
                              <AppIcon name="warning" size={15} color={theme.warning} />
                              <ThemedText
                                numeric
                                className="text-xs font-bold text-ledger-ochre dark:text-ledger-ochre-dark"
                              >
                                {csvPreviewResult.errors.length} issue(s) detected:
                              </ThemedText>
                            </View>
                            {csvPreviewResult.errors.slice(0, 4).map((err, idx) => (
                              <ThemedText
                                key={idx}
                                className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                              >
                                · {err}
                              </ThemedText>
                            ))}
                            {csvPreviewResult.errors.length > 4 && (
                              <ThemedText
                                numeric
                                className="text-xs text-ledger-ochre dark:text-ledger-ochre-dark font-medium"
                              >
                                + {csvPreviewResult.errors.length - 4} more rows skipped
                              </ThemedText>
                            )}
                          </View>
                        )}

                        {/* Valid transactions preview */}
                        {csvPreviewResult.valid.length > 0 ? (
                          <View className="p-4 rounded-2xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-3">
                            <View className="flex-row items-center gap-2">
                              <AppIcon name="checkCircle" size={16} color={theme.positive} />
                              <ThemedText
                                numeric
                                className="text-xs font-bold text-ledger-pine dark:text-ledger-pine-dark"
                              >
                                {csvPreviewResult.valid.length} valid transaction(s) ready to import
                              </ThemedText>
                            </View>

                            <Pressable
                              onPress={handleImportCsvTransactions}
                              disabled={batchCreateMutation.isPending}
                              accessibilityRole="button"
                              accessibilityLabel={`Import ${csvPreviewResult.valid.length} transactions`}
                              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-2"
                            >
                              {batchCreateMutation.isPending ? (
                                <ActivityIndicator color={theme.onPrimary} size="small" />
                              ) : (
                                <>
                                  <AppIcon name="import" size={15} color={theme.onPrimary} />
                                  <ThemedText
                                    numeric
                                    className="text-ledger-canvas dark:text-brand-900 text-xs font-bold"
                                  >
                                    Import {csvPreviewResult.valid.length} Transactions
                                  </ThemedText>
                                </>
                              )}
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => setCsvPreviewResult(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Re-check CSV"
                            className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                          >
                            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                              Re-check CSV
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* ============================================================== */}
            {/* RESET DATA SECTION */}
            {/* ============================================================== */}
            <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3.5">
              <View className="gap-0.5">
                <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Reset Data
                </ThemedText>
                <ThemedText className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Clear all recorded transactions from your ledger. Accounts and settings remain intact.
                </ThemedText>
              </View>

              {!confirmingClearAll ? (
                <Pressable
                  onPress={() => {
                    setErrorMessage(null);
                    setConfirmingClearAll(true);
                  }}
                  disabled={clearAllMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Reset all data"
                  className="min-h-[44px] py-3 px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    Reset All Data
                  </ThemedText>
                </Pressable>
              ) : (
                <View className="p-4 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-3">
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark leading-4">
                    Clear all recorded entries? This removes your transactions and cannot be undone.
                  </ThemedText>

                  <View className="flex-row gap-2.5">
                    <Pressable
                      onPress={() => {
                        setConfirmingClearAll(false);
                        setErrorMessage(null);
                      }}
                      disabled={clearAllMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel resetting all data"
                      className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Cancel
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => void handleConfirmResetData()}
                      disabled={clearAllMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm reset all data"
                      className={`flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center ${
                        clearAllMutation.isPending ? 'opacity-60' : ''
                      }`}
                    >
                      {clearAllMutation.isPending ? (
                        <ActivityIndicator size="small" color={theme.background} />
                      ) : (
                        <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                          Confirm Reset
                        </ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
