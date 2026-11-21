import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
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
  type CreateTransactionInput,
  type ParseTransactionsCsvResult,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import {
  useAccounts,
  useAllCategories,
  useBatchCreateTransactions,
  useExportBackup,
  useImportBackup,
  useTransactions,
} from '@/features/transactions/hooks/use-transactions';

type PortabilityTab = 'export' | 'import';
type ImportFormat = 'json' | 'csv';
type ImportMode = 'merge' | 'overwrite';

export function PortabilityScreen() {
  const { isAuthenticated } = useRequireAuth();
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

  // Inputs & Previews
  const [jsonInput, setJsonInput] = useState<string>('');
  const [csvInput, setCsvInput] = useState<string>('');

  const [validatedBackup, setValidatedBackup] = useState<BackupEnvelope | null>(null);
  const [csvPreviewResult, setCsvPreviewResult] = useState<ParseTransactionsCsvResult | null>(null);

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File Download Helper
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToastMessage(`✓ Downloaded ${filename}`);
    } else {
      copyToClipboard(content, filename);
    }
  };

  // Clipboard Helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setToastMessage(`✓ ${label} copied to clipboard!`);
        return;
      }
    } catch {
      // Fallback
    }
    setToastMessage(`✓ ${label} ready`);
  };

  // File Upload Handler (Web)
  const handleSelectFile = (format: 'json' | 'csv') => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = format === 'json' ? '.json,application/json' : '.csv,text/csv,text/plain';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            if (format === 'json') {
              setJsonInput(content);
              setValidatedBackup(null);
            } else {
              setCsvInput(content);
              setCsvPreviewResult(null);
            }
            setToastMessage(`Loaded file: ${file.name}`);
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  };

  // Export Handlers
  const handleExportJson = async (action: 'download' | 'copy') => {
    setErrorMessage(null);
    try {
      const backupData = await exportBackupMutation.mutateAsync();
      const jsonString = JSON.stringify(backupData, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (action === 'download') {
        downloadFile(jsonString, `budget-tracker-backup-${timestamp}.json`, 'application/json');
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
        downloadFile(
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
      setToastMessage('✓ Backup verified and ready to restore!');
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
        `✓ Backup restored successfully (${result.importedCount} transactions ${
          importMode === 'overwrite' ? 'replaced' : 'merged'
        })!`,
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
        setToastMessage(`✓ CSV preview generated: ${result.valid.length} valid transactions.`);
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
      setToastMessage(`✓ Successfully imported ${created.length} transactions from CSV!`);
      setCsvPreviewResult(null);
      setCsvInput('');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import CSV transactions.');
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
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Top Bar Header */}
          <View className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70">
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/dashboard' as any);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                className="py-1.5 px-3 rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75 flex-row items-center gap-1"
              >
                <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  ← Back
                </ThemedText>
              </Pressable>

              <View className="items-center flex-1 px-1">
                <ThemedText
                  className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white text-center"
                  numberOfLines={1}
                >
                  Data Portability & Backup
                </ThemedText>
                <ThemedText
                  className="text-[10px] sm:text-[11px] text-slate-500 text-center"
                  numberOfLines={1}
                >
                  Export for peace of mind or restore from backups
                </ThemedText>
              </View>

              <View className="w-12 sm:w-16" />
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              width: '100%',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 96,
              gap: 18,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Non-blocking Success Toast Banner */}
            {toastMessage && (
              <View className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <ThemedText className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {toastMessage}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setToastMessage(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notification"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 active:opacity-75"
                >
                  <ThemedText className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                    Dismiss
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <View className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {errorMessage}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setErrorMessage(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss error"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="px-2 py-1 rounded-full bg-rose-100 dark:bg-rose-900/50 active:opacity-75"
                >
                  <ThemedText className="text-[11px] font-bold text-rose-800 dark:text-rose-200">
                    Dismiss
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* Main Section Selector Tabs: [ Export ] vs [ Import ] */}
            <View className="flex-row rounded-2xl bg-slate-200/70 dark:bg-slate-800/80 p-1">
              <Pressable
                onPress={() => {
                  setActiveTab('export');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center transition-colors ${
                  activeTab === 'export'
                    ? 'bg-brand-500 shadow-sm'
                    : 'bg-transparent active:opacity-70'
                }`}
              >
                <ThemedText
                  className={`text-sm font-bold ${
                    activeTab === 'export' ? 'text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  📤 Export Data
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  setActiveTab('import');
                  setErrorMessage(null);
                }}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center transition-colors ${
                  activeTab === 'import'
                    ? 'bg-brand-500 shadow-sm'
                    : 'bg-transparent active:opacity-70'
                }`}
              >
                <ThemedText
                  className={`text-sm font-bold ${
                    activeTab === 'import' ? 'text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  📥 Import Data
                </ThemedText>
              </Pressable>
            </View>

            {/* ============================================================== */}
            {/* EXPORT SECTION */}
            {/* ============================================================== */}
            {activeTab === 'export' && (
              <View className="gap-5">
                {/* 1. Full JSON Backup Card */}
                <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-brand-950/50 items-center justify-center border border-brand-500/20">
                      <ThemedText className="text-xl">💾</ThemedText>
                    </View>
                    <View className="flex-1">
                      <ThemedText className="text-base font-extrabold text-slate-900 dark:text-white">
                        Full JSON Backup
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-500">
                        Complete Snapshot (Accounts, Categories, Transactions, Envelopes, Bills,
                        Sinking Funds, Presets)
                      </ThemedText>
                    </View>
                  </View>

                  {/* Summary Badges */}
                  <View className="flex-row flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      <ThemedText className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {accounts.length} Accounts
                      </ThemedText>
                    </View>
                    <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      <ThemedText className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {categories.length} Categories
                      </ThemedText>
                    </View>
                    <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      <ThemedText className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        {transactions.length} Transactions
                      </ThemedText>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row gap-3 pt-2">
                    <Pressable
                      onPress={() => handleExportJson('download')}
                      disabled={exportBackupMutation.isPending}
                      className="flex-1 py-3 px-4 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm shadow-brand-500/20"
                    >
                      {exportBackupMutation.isPending ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <ThemedText className="text-white text-xs font-bold">
                          Export JSON Backup
                        </ThemedText>
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() => handleExportJson('copy')}
                      disabled={exportBackupMutation.isPending}
                      className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 border border-slate-200/80 dark:border-slate-700 items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Copy to Clipboard 📋
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>

                {/* 2. Transactions CSV Card */}
                <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
                  <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 items-center justify-center border border-emerald-500/20">
                      <ThemedText className="text-xl">📊</ThemedText>
                    </View>
                    <View className="flex-1">
                      <ThemedText className="text-base font-extrabold text-slate-900 dark:text-white">
                        Transactions CSV
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-500">
                        Spreadsheet-ready CSV (compatible with Excel, Google Sheets, Numbers)
                      </ThemedText>
                    </View>
                  </View>

                  {/* Summary Badges */}
                  <View className="flex-row flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <View className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20">
                      <ThemedText className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {transactions.length} Transactions Ready
                      </ThemedText>
                    </View>
                    <View className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                      <ThemedText className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        RFC 4180 Compliant
                      </ThemedText>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row gap-3 pt-2">
                    <Pressable
                      onPress={() => handleExportCsv('download')}
                      className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 active:bg-emerald-700 items-center justify-center shadow-sm shadow-emerald-600/20"
                    >
                      <ThemedText className="text-white text-xs font-bold">
                        Export Transactions CSV
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => handleExportCsv('copy')}
                      className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 border border-slate-200/80 dark:border-slate-700 items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Copy to Clipboard 📋
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
              <View className="gap-5">
                {/* Format Selector: [ JSON Backup ] | [ Transactions CSV ] */}
                <View className="flex-row rounded-2xl bg-slate-200/60 dark:bg-slate-800/60 p-1">
                  <Pressable
                    onPress={() => {
                      setImportFormat('json');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-2 rounded-xl items-center justify-center transition-colors ${
                      importFormat === 'json'
                        ? 'bg-white dark:bg-slate-900 shadow-sm'
                        : 'bg-transparent active:opacity-70'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        importFormat === 'json'
                          ? 'text-brand-600 dark:text-brand-400'
                          : 'text-slate-600 dark:text-slate-400'
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
                    className={`flex-1 py-2 rounded-xl items-center justify-center transition-colors ${
                      importFormat === 'csv'
                        ? 'bg-white dark:bg-slate-900 shadow-sm'
                        : 'bg-transparent active:opacity-70'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-bold ${
                        importFormat === 'csv'
                          ? 'text-brand-600 dark:text-brand-400'
                          : 'text-slate-600 dark:text-slate-400'
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
                  <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
                    <View className="flex-row items-center justify-between">
                      <View className="gap-0.5">
                        <ThemedText className="text-base font-extrabold text-slate-900 dark:text-white">
                          Restore JSON Backup
                        </ThemedText>
                        <ThemedText className="text-xs text-slate-500">
                          Paste backup payload or select a file
                        </ThemedText>
                      </View>

                      {Platform.OS === 'web' && (
                        <Pressable
                          onPress={() => handleSelectFile('json')}
                          className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75 border border-slate-200 dark:border-slate-700"
                        >
                          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            📂 Choose File
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
                        placeholderTextColor="#94a3b8"
                        style={{
                          minHeight: 140,
                          textAlignVertical: 'top',
                          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        }}
                        className="w-full p-3.5 text-xs rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                      />
                      {jsonInput.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setJsonInput('');
                            setValidatedBackup(null);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Clear JSON input"
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800"
                        >
                          <ThemedText className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            Clear
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>

                    {/* Mode Selection */}
                    <View className="gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                      <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Restore Strategy
                      </ThemedText>

                      <View className="flex-row gap-3">
                        <Pressable
                          onPress={() => setImportMode('merge')}
                          className={`flex-1 p-3 rounded-2xl border ${
                            importMode === 'merge'
                              ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-500'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold mb-1 ${
                              importMode === 'merge'
                                ? 'text-brand-700 dark:text-brand-300'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            Merge (Recommended)
                          </ThemedText>
                          <ThemedText className="text-[10px] text-slate-500">
                            Keep existing data and append new records, deduplicating by ID.
                          </ThemedText>
                        </Pressable>

                        <Pressable
                          onPress={() => setImportMode('overwrite')}
                          className={`flex-1 p-3 rounded-2xl border ${
                            importMode === 'overwrite'
                              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold mb-1 ${
                              importMode === 'overwrite'
                                ? 'text-rose-700 dark:text-rose-300'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            Overwrite (Full Replace)
                          </ThemedText>
                          <ThemedText className="text-[10px] text-slate-500">
                            Wipe all existing data and restore exactly what is in this backup.
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>

                    {/* Validate Button */}
                    {!validatedBackup && (
                      <Pressable
                        onPress={handleValidateJson}
                        className="w-full py-3 px-4 rounded-2xl bg-slate-900 dark:bg-slate-100 active:opacity-80 items-center justify-center mt-1"
                      >
                        <ThemedText className="text-white dark:text-slate-900 text-xs font-bold">
                          Validate Backup 🔍
                        </ThemedText>
                      </Pressable>
                    )}

                    {/* Validated Summary Preview */}
                    {validatedBackup && (
                      <View className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 gap-3 mt-1">
                        <View className="flex-row items-center gap-2">
                          <ThemedText className="text-base">✓</ThemedText>
                          <ThemedText className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
                            Ready to restore:
                          </ThemedText>
                        </View>

                        <View className="flex-row flex-wrap gap-2">
                          <View className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-500/20">
                            <ThemedText className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {validatedBackup.data.accounts.length} Accounts
                            </ThemedText>
                          </View>
                          <View className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-500/20">
                            <ThemedText className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {validatedBackup.data.categories.length} Categories
                            </ThemedText>
                          </View>
                          <View className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-500/20">
                            <ThemedText className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {validatedBackup.data.transactions.length} Transactions
                            </ThemedText>
                          </View>
                          <View className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-500/20">
                            <ThemedText className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {validatedBackup.data.categoryBudgets.length} Envelopes
                            </ThemedText>
                          </View>
                          <View className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-500/20">
                            <ThemedText className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {validatedBackup.data.recurringCommitments.length} Bills
                            </ThemedText>
                          </View>
                          <View className="px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-emerald-500/20">
                            <ThemedText className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              {validatedBackup.data.sinkingFunds.length} Sinking Funds
                            </ThemedText>
                          </View>
                        </View>

                        {/* Confirm & Restore Action */}
                        <Pressable
                          onPress={handleConfirmRestoreJson}
                          disabled={importBackupMutation.isPending}
                          className={`w-full py-3.5 px-4 rounded-2xl items-center justify-center mt-1 ${
                            importMode === 'overwrite'
                              ? 'bg-rose-600 active:bg-rose-700'
                              : 'bg-emerald-600 active:bg-emerald-700'
                          }`}
                        >
                          {importBackupMutation.isPending ? (
                            <ActivityIndicator color="white" size="small" />
                          ) : (
                            <ThemedText className="text-white text-xs font-bold">
                              {importMode === 'overwrite'
                                ? 'Confirm & Overwrite All Data ⚠️'
                                : 'Confirm & Restore (Merge) ✨'}
                            </ThemedText>
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
                  <View className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-4">
                    <View className="flex-row items-center justify-between">
                      <View className="gap-0.5">
                        <ThemedText className="text-base font-extrabold text-slate-900 dark:text-white">
                          Import Transactions CSV
                        </ThemedText>
                        <ThemedText className="text-xs text-slate-500">
                          Paste CSV table or select a file
                        </ThemedText>
                      </View>

                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={handleLoadCsvTemplate}
                          className="px-2.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75 border border-slate-200 dark:border-slate-700"
                        >
                          <ThemedText className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Sample Template
                          </ThemedText>
                        </Pressable>

                        {Platform.OS === 'web' && (
                          <Pressable
                            onPress={() => handleSelectFile('csv')}
                            className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75 border border-slate-200 dark:border-slate-700"
                          >
                            <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              📂 Choose File
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
                        placeholderTextColor="#94a3b8"
                        style={{
                          minHeight: 140,
                          textAlignVertical: 'top',
                          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        }}
                        className="w-full p-3.5 text-xs rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                      />
                      {csvInput.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setCsvInput('');
                            setCsvPreviewResult(null);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Clear CSV input"
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800"
                        >
                          <ThemedText className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            Clear
                          </ThemedText>
                        </Pressable>
                      )}
                    </View>

                    {/* Preview CSV Button */}
                    {!csvPreviewResult && (
                      <Pressable
                        onPress={handlePreviewCsv}
                        className="w-full py-3 px-4 rounded-2xl bg-slate-900 dark:bg-slate-100 active:opacity-80 items-center justify-center mt-1"
                      >
                        <ThemedText className="text-white dark:text-slate-900 text-xs font-bold">
                          Preview CSV Transactions 🔍
                        </ThemedText>
                      </Pressable>
                    )}

                    {/* CSV Parse Results */}
                    {csvPreviewResult && (
                      <View className="gap-3 mt-1">
                        {/* Errors summary if any */}
                        {csvPreviewResult.errors.length > 0 && (
                          <View className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-500/30 gap-1.5">
                            <ThemedText className="text-xs font-bold text-amber-800 dark:text-amber-200">
                              ⚠️ {csvPreviewResult.errors.length} issue(s) detected:
                            </ThemedText>
                            {csvPreviewResult.errors.slice(0, 4).map((err, idx) => (
                              <ThemedText
                                key={idx}
                                className="text-[11px] text-amber-700 dark:text-amber-300"
                              >
                                • {err}
                              </ThemedText>
                            ))}
                            {csvPreviewResult.errors.length > 4 && (
                              <ThemedText className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                + {csvPreviewResult.errors.length - 4} more rows skipped
                              </ThemedText>
                            )}
                          </View>
                        )}

                        {/* Valid transactions preview */}
                        {csvPreviewResult.valid.length > 0 ? (
                          <View className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 gap-3">
                            <ThemedText className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
                              ✓ {csvPreviewResult.valid.length} valid transaction(s) ready to import
                            </ThemedText>

                            <Pressable
                              onPress={handleImportCsvTransactions}
                              disabled={batchCreateMutation.isPending}
                              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 active:bg-emerald-700 items-center justify-center"
                            >
                              {batchCreateMutation.isPending ? (
                                <ActivityIndicator color="white" size="small" />
                              ) : (
                                <ThemedText className="text-white text-xs font-bold">
                                  Import {csvPreviewResult.valid.length} Transactions 🚀
                                </ThemedText>
                              )}
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => setCsvPreviewResult(null)}
                            className="w-full py-3 px-4 rounded-2xl bg-slate-200 dark:bg-slate-800 items-center justify-center"
                          >
                            <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}