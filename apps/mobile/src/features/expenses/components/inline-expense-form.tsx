import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  formatDateInputValue,
  formatMinorUnits,
  getAccountTypeLabel,
  getNextDueDatePreset,
  normalizeDecimalInput,
  parseCalendarDate,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  type Account,
  type Category,
  type CommitmentFrequency,
  type CreateTransactionInput,
  type RecurringCommitmentInput,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { Colors } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

import type { ExpenseFormMode } from './expense-form-modal';

export interface InlineExpenseFormProps {
  activeTab: 'RECORDED' | 'SCHEDULED';
  accounts: readonly Account[];
  expenseCategories: readonly Category[];
  defaultAccountId?: string;
  defaultCategoryId?: string;
  onSaveExpense: (payload: { input: CreateTransactionInput }) => Promise<void>;
  onSaveCommitment: (
    payload: Omit<RecurringCommitmentInput, 'id'>,
  ) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

const MODE_OPTIONS: readonly { key: ExpenseFormMode; label: string }[] = [
  { key: 'ONE_TIME', label: '🧾 One-Time' },
  { key: 'RECURRING', label: '🔄 Recurring' },
  { key: 'INSTALLMENT', label: '🏦 Loan' },
];

const FREQUENCY_OPTIONS: readonly { value: CommitmentFrequency; label: string }[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
];

const DUE_LABEL_PRESETS = ['PAYROLL', 'Weekly', 'No fixed date'] as const;

export function InlineExpenseForm({
  activeTab,
  accounts,
  expenseCategories,
  defaultAccountId,
  defaultCategoryId,
  onSaveExpense,
  onSaveCommitment,
  onClose,
  isSaving,
}: InlineExpenseFormProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [mode, setMode] = useState<ExpenseFormMode>(
    activeTab === 'SCHEDULED' ? 'RECURRING' : 'ONE_TIME',
  );
  const [nameInput, setNameInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id ?? '',
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    defaultCategoryId ?? expenseCategories[0]?.id ?? '',
  );
  const [dateInput, setDateInput] = useState(() =>
    formatDateInputValue(new Date().toISOString()),
  );
  const [noteInput, setNoteInput] = useState('');
  const [frequency, setFrequency] = useState<CommitmentFrequency>('MONTHLY');
  const [dueDayInput, setDueDayInput] = useState('15');
  const [dueLabelInput, setDueLabelInput] = useState('');
  const [nextDueDateInput, setNextDueDateInput] = useState('');
  const [totalTermsInput, setTotalTermsInput] = useState('');
  const [remainingTermsInput, setRemainingTermsInput] = useState('');
  const [isAutoPaid, setIsAutoPaid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAccountId && (defaultAccountId || accounts[0]?.id)) {
      setSelectedAccountId(defaultAccountId ?? accounts[0]?.id ?? '');
    }
  }, [defaultAccountId, accounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedCategoryId && (defaultCategoryId || expenseCategories[0]?.id)) {
      setSelectedCategoryId(defaultCategoryId ?? expenseCategories[0]?.id ?? '');
    }
  }, [defaultCategoryId, expenseCategories, selectedCategoryId]);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const activeCurrency = activeAccount?.currency ?? DEFAULT_CURRENCY;
  const parsedAmountMinor = useMemo(
    () => parseDecimalToMinorUnits(amountInput),
    [amountInput],
  );

  const totalTermsTrimmed = totalTermsInput.trim();
  const remainingTermsTrimmed = remainingTermsInput.trim();
  const parsedTotalTerms = /^\d+$/.test(totalTermsTrimmed)
    ? Number.parseInt(totalTermsTrimmed, 10)
    : NaN;
  const parsedRemainingTerms = /^\d+$/.test(remainingTermsTrimmed)
    ? Number.parseInt(remainingTermsTrimmed, 10)
    : NaN;

  const termPreview = useMemo(() => {
    if (mode === 'ONE_TIME') return null;
    if (
      !Number.isFinite(parsedTotalTerms) ||
      parsedTotalTerms <= 0 ||
      !Number.isFinite(parsedRemainingTerms) ||
      parsedRemainingTerms < 0 ||
      parsedRemainingTerms > parsedTotalTerms ||
      parsedAmountMinor === null ||
      parsedAmountMinor <= 0
    ) {
      return null;
    }
    return {
      totalMinor: parsedTotalTerms * parsedAmountMinor,
      completedTerms: parsedTotalTerms - parsedRemainingTerms,
      remainingTerms: parsedRemainingTerms,
      remainingBalanceMinor: parsedRemainingTerms * parsedAmountMinor,
    };
  }, [mode, parsedTotalTerms, parsedRemainingTerms, parsedAmountMinor]);

  const handleSelectMode = (nextMode: ExpenseFormMode) => {
    setMode(nextMode);
    setFormError(null);
    if (nextMode === 'INSTALLMENT') {
      const loansCat = expenseCategories.find((c) => c.id === 'cat-loans');
      if (loansCat) setSelectedCategoryId(loansCat.id);
    } else if (nextMode === 'RECURRING' && selectedCategoryId === 'cat-loans') {
      const recurringDefault =
        expenseCategories.find((c) => c.id === 'cat-subscription') ??
        expenseCategories.find((c) => c.id === 'cat-dues');
      if (recurringDefault) setSelectedCategoryId(recurringDefault.id);
    }
  };

  const resetInputsAfterSave = () => {
    setNameInput('');
    setAmountInput('');
    setNoteInput('');
    setDueLabelInput('');
    setNextDueDateInput('');
    setTotalTermsInput('');
    setRemainingTermsInput('');
    setIsAutoPaid(false);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (parsedAmountMinor === null || parsedAmountMinor <= 0) {
      setFormError('Please enter an amount greater than 0.');
      return;
    }
    if (!activeAccount) {
      setFormError('Please select an account.');
      return;
    }
    if (!selectedCategoryId) {
      setFormError('Please select a category.');
      return;
    }

    if (mode === 'ONE_TIME') {
      const occurredAtIso = parseDateInputToIso(dateInput);
      if (!occurredAtIso) {
        setFormError('Please enter a valid date in YYYY-MM-DD format.');
        return;
      }

      setFormError(null);
      try {
        await onSaveExpense({
          input: {
            type: 'EXPENSE',
            amountMinor: parsedAmountMinor,
            currency: activeAccount.currency ?? DEFAULT_CURRENCY,
            accountId: activeAccount.id,
            categoryId: selectedCategoryId,
            merchant: nameInput.trim() || undefined,
            note: noteInput.trim() || undefined,
            tags: [],
            occurredAt: occurredAtIso,
          },
        });
        resetInputsAfterSave();
      } catch (error: unknown) {
        setFormError(
          error instanceof Error ? error.message : 'Could not save expense.',
        );
      }
      return;
    }

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setFormError(
        mode === 'INSTALLMENT'
          ? 'Please enter a loan or installment name.'
          : 'Please enter a recurring expense name.',
      );
      return;
    }

    const parsedDueDay = Number.parseInt(dueDayInput.trim(), 10);
    if (!Number.isFinite(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
      setFormError('Due day must be between 1 and 31.');
      return;
    }

    const trimmedNextDueDate = nextDueDateInput.trim();
    if (trimmedNextDueDate.length > 0 && !parseCalendarDate(trimmedNextDueDate)) {
      setFormError('Next due date must be a valid date in YYYY-MM-DD format.');
      return;
    }

    let totalInstallments: number | undefined;
    let paidInstallments = 0;

    if (totalTermsTrimmed.length > 0 || remainingTermsTrimmed.length > 0) {
      if (!Number.isFinite(parsedTotalTerms) || parsedTotalTerms <= 0) {
        setFormError('Total terms must be a whole number greater than 0.');
        return;
      }
      if (!Number.isFinite(parsedRemainingTerms) || parsedRemainingTerms < 0) {
        setFormError('Remaining terms must be 0 or greater.');
        return;
      }
      if (parsedRemainingTerms > parsedTotalTerms) {
        setFormError('Remaining terms cannot exceed total terms.');
        return;
      }
      totalInstallments = parsedTotalTerms;
      paidInstallments = parsedTotalTerms - parsedRemainingTerms;
    }

    const trimmedDueLabel = dueLabelInput.trim();
    const isPaidOff =
      totalInstallments !== undefined && paidInstallments >= totalInstallments;

    setFormError(null);
    try {
      await onSaveCommitment({
        name: trimmedName,
        kind: mode === 'INSTALLMENT' ? 'INSTALLMENT' : 'RECURRING',
        amountMinor: parsedAmountMinor,
        currency: activeAccount.currency ?? DEFAULT_CURRENCY,
        accountId: activeAccount.id,
        categoryId: selectedCategoryId,
        frequency,
        dueDay: parsedDueDay,
        dueLabel: trimmedDueLabel.length > 0 ? trimmedDueLabel : undefined,
        nextDueDate: trimmedNextDueDate.length > 0 ? trimmedNextDueDate : undefined,
        isAutoPaid,
        isActive: !isPaidOff,
        totalInstallments,
        paidInstallments,
        notes: noteInput.trim() || undefined,
      });
      resetInputsAfterSave();
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Could not save schedule.',
      );
    }
  };

  return (
    <View className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-brand-200 dark:border-brand-800/70 shadow-sm gap-4">
      {/* Header Row */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0 gap-0.5">
          <ThemedText className="text-sm font-extrabold text-slate-900 dark:text-white">
            Quick Expense Form
          </ThemedText>
          <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
            Add one-time, recurring, or loan expenses directly without a popup
          </ThemedText>
        </View>

        <Pressable
          onPress={onClose}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Hide quick expense form"
          className="shrink-0 min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
        >
          <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Hide Form
          </ThemedText>
        </Pressable>
      </View>

      {/* Inline Error Alert */}
      {formError ? (
        <View
          accessibilityRole="alert"
          className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60"
        >
          <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            {formError}
          </ThemedText>
        </View>
      ) : null}

      {/* Type Switcher */}
      <View className="flex-row flex-wrap gap-2">
        {MODE_OPTIONS.map((opt) => {
          const isSelected = mode === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => handleSelectMode(opt.key)}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel={`Quick form type ${opt.label}`}
              accessibilityState={{ selected: isSelected }}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                isSelected
                  ? 'bg-brand-500 border-brand-600'
                  : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 active:opacity-75'
              }`}
            >
              <ThemedText
                className={`text-xs font-bold ${
                  isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Primary Inputs Row */}
      <View className={isWide ? 'flex-row items-start gap-3' : 'gap-3'}>
        <View className={isWide ? 'flex-[2] min-w-[200px] gap-1' : 'gap-1'}>
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {mode === 'ONE_TIME' ? 'Merchant / Title (Optional)' : 'Obligation / Loan Name'}
          </ThemedText>
          <TextInput
            value={nameInput}
            onChangeText={(text) => {
              setNameInput(text);
              if (formError) setFormError(null);
            }}
            placeholder={
              mode === 'ONE_TIME'
                ? 'e.g. Groceries, Grab, Coffee'
                : mode === 'INSTALLMENT'
                  ? 'e.g. Maya Loan, Home Credit'
                  : 'e.g. House Rent, PLDT Internet'
            }
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Expense or obligation name"
            editable={!isSaving}
            className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-semibold"
          />
        </View>

        <View className={isWide ? 'flex-1 min-w-[150px] gap-1' : 'gap-1'}>
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Amount ({DEFAULT_CURRENCY_SYMBOL})
          </ThemedText>
          <TextInput
            value={amountInput}
            onChangeText={(text) => {
              setAmountInput(normalizeDecimalInput(text));
              if (formError) setFormError(null);
            }}
            placeholder="0.00"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Expense amount"
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            editable={!isSaving}
            className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold font-mono"
          />
        </View>

        {mode === 'ONE_TIME' ? (
          <View className={isWide ? 'flex-1 min-w-[150px] gap-1' : 'gap-1'}>
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Date (YYYY-MM-DD)
            </ThemedText>
            <TextInput
              value={dateInput}
              onChangeText={(text) => {
                setDateInput(text);
                if (formError) setFormError(null);
              }}
              placeholder="2026-11-21"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Expense date"
              editable={!isSaving}
              className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-semibold"
            />
          </View>
        ) : (
          <View className={isWide ? 'w-[120px] gap-1' : 'gap-1'}>
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Due Day (1–31)
            </ThemedText>
            <TextInput
              value={dueDayInput}
              onChangeText={(text) => {
                setDueDayInput(text);
                if (formError) setFormError(null);
              }}
              placeholder="15"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Due day of month"
              keyboardType="number-pad"
              editable={!isSaving}
              className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold text-center"
            />
          </View>
        )}
      </View>

      {/* Scheduled Specific Row */}
      {mode !== 'ONE_TIME' && (
        <View className="gap-3">
          <View className={isWide ? 'flex-row flex-wrap items-start gap-3' : 'gap-3'}>
            <View className={isWide ? 'flex-1 min-w-[190px] gap-1' : 'gap-1'}>
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Next Due Date (Optional)
              </ThemedText>
              <TextInput
                value={nextDueDateInput}
                onChangeText={(text) => {
                  setNextDueDateInput(text);
                  const parsed = parseCalendarDate(text);
                  if (parsed) {
                    setDueDayInput(String(parsed.getDate()));
                  }
                  if (formError) setFormError(null);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Next due date"
                editable={!isSaving}
                className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium"
              />
            </View>

            <View className={isWide ? 'flex-1 min-w-[200px] gap-1' : 'gap-1'}>
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Schedule Label (Optional)
              </ThemedText>
              <TextInput
                value={dueLabelInput}
                onChangeText={setDueLabelInput}
                placeholder="PAYROLL, Weekly, April 25, No fixed date"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Schedule label"
                editable={!isSaving}
                className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
              />
            </View>

            <View className={isWide ? 'w-[130px] gap-1' : 'gap-1'}>
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Terms
              </ThemedText>
              <TextInput
                value={totalTermsInput}
                onChangeText={(text) => {
                  setTotalTermsInput(text);
                  if (formError) setFormError(null);
                }}
                placeholder="Optional"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Total terms"
                keyboardType="number-pad"
                editable={!isSaving}
                className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold"
              />
            </View>

            <View className={isWide ? 'w-[140px] gap-1' : 'gap-1'}>
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Remaining Terms
              </ThemedText>
              <TextInput
                value={remainingTermsInput}
                onChangeText={(text) => {
                  setRemainingTermsInput(text);
                  if (formError) setFormError(null);
                }}
                placeholder="Optional"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Remaining terms"
                keyboardType="number-pad"
                editable={!isSaving}
                className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold"
              />
            </View>

            <View className={isWide ? 'w-[140px] gap-1' : 'gap-1'}>
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Auto-Pay
              </ThemedText>
              <View className="h-12 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex-row items-center justify-between">
                <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Enabled
                </ThemedText>
                <Switch
                  value={isAutoPaid}
                  onValueChange={setIsAutoPaid}
                  disabled={isSaving}
                  accessibilityLabel="Auto-pay enabled"
                />
              </View>
            </View>
          </View>

          {/* Frequency & Label Preset Chips */}
          <View className="flex-row flex-wrap items-center gap-2">
            {FREQUENCY_OPTIONS.map((opt) => {
              const isSelected = frequency === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setFrequency(opt.value)}
                  disabled={isSaving}
                  accessibilityRole="button"
                  accessibilityLabel={`Quick frequency ${opt.label}`}
                  accessibilityState={{ selected: isSelected }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                    isSelected
                      ? 'bg-slate-800 dark:bg-slate-200 border-slate-800 dark:border-slate-200'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                  }`}
                >
                  <ThemedText
                    className={`text-xs font-semibold ${
                      isSelected
                        ? 'text-white dark:text-slate-900'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}

            {DUE_LABEL_PRESETS.map((presetLabel) => {
              const isSelected =
                dueLabelInput.trim().toLowerCase() === presetLabel.toLowerCase();
              return (
                <Pressable
                  key={presetLabel}
                  onPress={() => {
                    if (isSelected) {
                      setDueLabelInput('');
                      return;
                    }
                    setDueLabelInput(presetLabel);
                    if (presetLabel === 'Weekly') setFrequency('WEEKLY');
                    if (presetLabel === 'PAYROLL') setIsAutoPaid(true);
                  }}
                  disabled={isSaving}
                  accessibilityRole="button"
                  accessibilityLabel={`Quick schedule label ${presetLabel}`}
                  accessibilityState={{ selected: isSelected }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                    isSelected
                      ? 'bg-brand-50 dark:bg-brand-900/40 border-brand-500'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                  }`}
                >
                  <ThemedText
                    className={`text-xs font-semibold ${
                      isSelected
                        ? 'text-brand-700 dark:text-brand-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {presetLabel}
                  </ThemedText>
                </Pressable>
              );
            })}

            {(
              [
                { key: 'TODAY', label: 'Due: Today' },
                { key: 'NEXT_WEEK', label: 'Due: +1 Week' },
                { key: 'NEXT_MONTH', label: 'Due: Next Month' },
              ] as const
            ).map((preset) => {
              const anchorDay = Number.parseInt(dueDayInput.trim(), 10);
              const presetDate = getNextDueDatePreset(
                preset.key,
                Number.isFinite(anchorDay) ? anchorDay : undefined,
              );
              const isSelected = nextDueDateInput.trim() === presetDate;
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => {
                    if (isSelected) {
                      setNextDueDateInput('');
                      return;
                    }
                    setNextDueDateInput(presetDate);
                    const parsed = parseCalendarDate(presetDate);
                    if (parsed) {
                      setDueDayInput(String(parsed.getDate()));
                    }
                    if (formError) setFormError(null);
                  }}
                  disabled={isSaving}
                  accessibilityRole="button"
                  accessibilityLabel={`Set next due date to ${preset.label}`}
                  accessibilityState={{ selected: isSelected }}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                    isSelected
                      ? 'bg-brand-50 dark:bg-brand-900/40 border-brand-500'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                  }`}
                >
                  <ThemedText
                    className={`text-xs font-semibold ${
                      isSelected
                        ? 'text-brand-700 dark:text-brand-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {termPreview && (
            <ThemedText className="text-xs font-semibold text-brand-600 dark:text-brand-300">
              Total: {formatMinorUnits(termPreview.totalMinor, activeCurrency)} • Completed:{' '}
              {termPreview.completedTerms}/{parsedTotalTerms} • Remaining:{' '}
              {termPreview.remainingTerms} terms (
              {formatMinorUnits(termPreview.remainingBalanceMinor, activeCurrency)})
            </ThemedText>
          )}
        </View>
      )}

      {/* Category Chips */}
      <View className="gap-1.5">
        <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Category
        </ThemedText>
        <View className="flex-row flex-wrap gap-1.5">
          {expenseCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setSelectedCategoryId(cat.id);
                  if (formError) setFormError(null);
                }}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={`Select category ${cat.name}`}
                accessibilityState={{ selected: isSelected }}
                className={`max-w-full min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                  isSelected
                    ? 'bg-brand-50 dark:bg-brand-900/40 border-brand-500'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                }`}
              >
                <ThemedText className="text-xs">{cat.icon}</ThemedText>
                <ThemedText
                  className={`shrink text-xs font-semibold ${
                    isSelected
                      ? 'text-brand-700 dark:text-brand-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cat.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Account Chips & Note + Save Row */}
      <View className="gap-3">
        <View className="gap-1.5">
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Account
          </ThemedText>
          <View className="flex-row flex-wrap gap-1.5">
            {accounts.map((acc) => {
              const isSelected = selectedAccountId === acc.id;
              return (
                <Pressable
                  key={acc.id}
                  onPress={() => {
                    setSelectedAccountId(acc.id);
                    if (formError) setFormError(null);
                  }}
                  disabled={isSaving}
                  accessibilityRole="button"
                  accessibilityLabel={`Select account ${acc.name}`}
                  accessibilityState={{ selected: isSelected }}
                  className={`max-w-full min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-800 dark:bg-slate-200 border-slate-800 dark:border-slate-200'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                  }`}
                >
                  <ThemedText className="text-xs">{acc.icon}</ThemedText>
                  <ThemedText
                    className={`shrink text-xs font-semibold ${
                      isSelected
                        ? 'text-white dark:text-slate-900'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {acc.name} ({getAccountTypeLabel(acc.accountType)})
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className={isWide ? 'flex-row items-end gap-3' : 'gap-3'}>
          <View className={isWide ? 'flex-1 gap-1' : 'gap-1'}>
            <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Note (Optional)
            </ThemedText>
            <TextInput
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Optional note or reminder..."
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Optional note"
              editable={!isSaving}
              className="h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
            />
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Add expense from quick form"
            className="min-h-[48px] px-6 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm shadow-brand-500/20"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.dark.text} />
            ) : (
              <ThemedText className="text-sm font-bold text-white">
                {mode === 'ONE_TIME'
                  ? '+ Record Expense'
                  : mode === 'INSTALLMENT'
                    ? '+ Add Loan'
                    : '+ Add Recurring'}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
