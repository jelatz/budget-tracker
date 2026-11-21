import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  computeSplitRemainder,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  formatDateInputValue,
  formatMinorUnits,
  getAccountTypeLabel,
  getNextDueDatePreset,
  minorUnitsToDecimalInput,
  parseCalendarDate,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  type Account,
  type Category,
  type CommitmentFrequency,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type QuickPreset,
  type RecurringCommitment,
  type RecurringCommitmentInput,
  type Transaction,
  type TransactionSplit,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { Colors } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';

export type ExpenseFormMode = 'ONE_TIME' | 'RECURRING' | 'INSTALLMENT';

export interface ExpenseFormModalProps {
  visible: boolean;
  formSessionKey: number;
  initialMode?: ExpenseFormMode;
  editingExpense: Transaction | null;
  editingCommitment?: RecurringCommitment | null;
  accounts: readonly Account[];
  expenseCategories: readonly Category[];
  presets: readonly QuickPreset[];
  recentMerchants: readonly string[];
  knownTags: readonly string[];
  defaultAccountId?: string;
  defaultCategoryId?: string;
  draftSplits: TransactionSplit[];
  onChangeDraftSplits: (splits: TransactionSplit[]) => void;
  onOpenSplitEditor: (currentAmountMinor: number, currentCategoryId?: string) => void;
  onCreateCategory: (input: CreateCategoryInput) => Promise<Category>;
  onSave: (payload: { id?: string; input: CreateTransactionInput }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onSaveCommitment: (
    payload: Omit<RecurringCommitmentInput, 'id'> & { id?: string },
  ) => Promise<void>;
  onDeleteCommitment?: (id: string) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  externalAmountSync?: string | null;
  onClearExternalAmountSync?: () => void;
}

const QUICK_AMOUNT_PRESETS = [5000, 10000, 25000, 50000, 100000] as const;
const QUICK_DAY_PRESETS = [1, 5, 10, 15, 20, 25, 30] as const;
const CUSTOM_CATEGORY_ICONS = ['🏷️', '🏠', '🛒', '🚕', '🎬', '💊', '🏦', '📅', '📱', '✨'] as const;
const DEFAULT_CUSTOM_CATEGORY_COLOR = DEFAULT_CATEGORIES[0].color;

const MODE_OPTIONS: readonly { key: ExpenseFormMode; label: string }[] = [
  { key: 'ONE_TIME', label: '🧾 One-Time' },
  { key: 'RECURRING', label: '🔄 Recurring' },
  { key: 'INSTALLMENT', label: '🏦 Loan / Installment' },
];

const FREQUENCY_OPTIONS: readonly { value: CommitmentFrequency; label: string }[] = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-Weekly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export function ExpenseFormModal({
  visible,
  formSessionKey,
  initialMode = 'ONE_TIME',
  editingExpense,
  editingCommitment = null,
  accounts,
  expenseCategories,
  presets,
  recentMerchants,
  knownTags,
  defaultAccountId,
  defaultCategoryId,
  draftSplits,
  onChangeDraftSplits,
  onOpenSplitEditor,
  onCreateCategory,
  onSave,
  onDelete,
  onSaveCommitment,
  onDeleteCommitment,
  onClose,
  isSaving,
  isDeleting,
  externalAmountSync,
  onClearExternalAmountSync,
}: ExpenseFormModalProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const modalWidth = Math.min(Math.max(windowWidth - (isWide ? 48 : 24), 280), 820);

  const [mode, setMode] = useState<ExpenseFormMode>('ONE_TIME');
  const [amountInput, setAmountInput] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [merchantInput, setMerchantInput] = useState('');
  const [dateInput, setDateInput] = useState(() => formatDateInputValue(new Date().toISOString()));
  const [noteInput, setNoteInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Scheduled / Loan fields
  const [scheduleNameInput, setScheduleNameInput] = useState('');
  const [frequency, setFrequency] = useState<CommitmentFrequency>('MONTHLY');
  const [dueDayInput, setDueDayInput] = useState('15');
  const [dueLabelInput, setDueLabelInput] = useState('');
  const [nextDueDateInput, setNextDueDateInput] = useState('');
  const [isAutoPaid, setIsAutoPaid] = useState(false);
  const [totalTermsInput, setTotalTermsInput] = useState('');
  const [remainingTermsInput, setRemainingTermsInput] = useState('');

  // Custom Category Creator
  const [showCustomCategoryForm, setShowCustomCategoryForm] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customCategoryIcon, setCustomCategoryIcon] = useState<string>(CUSTOM_CATEGORY_ICONS[0]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pickDefaultCategoryForMode = (targetMode: ExpenseFormMode): string => {
    if (targetMode === 'INSTALLMENT') {
      return (
        expenseCategories.find((c) => c.id === 'cat-loans')?.id ??
        defaultCategoryId ??
        expenseCategories[0]?.id ??
        ''
      );
    }
    if (targetMode === 'RECURRING') {
      return (
        defaultCategoryId ??
        expenseCategories.find((c) => c.id === 'cat-subscription')?.id ??
        expenseCategories.find((c) => c.id === 'cat-dues')?.id ??
        expenseCategories[0]?.id ??
        ''
      );
    }
    return defaultCategoryId ?? expenseCategories[0]?.id ?? '';
  };

  // Initialize form ONLY when a new Add/Edit session opens (preserves state across SplitEditorModal round-trip)
  useEffect(() => {
    if (formSessionKey === 0) {
      return;
    }

    if (editingCommitment) {
      const commitmentMode: ExpenseFormMode =
        editingCommitment.kind === 'INSTALLMENT' ? 'INSTALLMENT' : 'RECURRING';
      const existingTotal = editingCommitment.totalInstallments;
      const existingRemaining =
        typeof existingTotal === 'number' && existingTotal > 0
          ? Math.max(0, existingTotal - editingCommitment.paidInstallments)
          : undefined;
      setMode(commitmentMode);
      setScheduleNameInput(editingCommitment.name);
      setAmountInput(minorUnitsToDecimalInput(editingCommitment.amountMinor));
      setSelectedAccountId(editingCommitment.accountId);
      setSelectedCategoryId(editingCommitment.categoryId);
      setFrequency(editingCommitment.frequency);
      setDueDayInput(String(editingCommitment.dueDay));
      setDueLabelInput(editingCommitment.dueLabel ?? '');
      setNextDueDateInput(editingCommitment.nextDueDate ?? '');
      setIsAutoPaid(editingCommitment.isAutoPaid);
      setTotalTermsInput(
        typeof existingTotal === 'number' && existingTotal > 0 ? String(existingTotal) : '',
      );
      setRemainingTermsInput(
        typeof existingRemaining === 'number' ? String(existingRemaining) : '',
      );
      setNoteInput(editingCommitment.notes ?? '');
      setMerchantInput('');
      setDateInput(formatDateInputValue(new Date().toISOString()));
      setTags([]);
    } else if (editingExpense) {
      setMode('ONE_TIME');
      setAmountInput(minorUnitsToDecimalInput(editingExpense.amountMinor));
      setSelectedAccountId(editingExpense.accountId);
      setSelectedCategoryId(
        editingExpense.categoryId ??
          defaultCategoryId ??
          expenseCategories[0]?.id ??
          '',
      );
      setMerchantInput(editingExpense.merchant ?? '');
      setDateInput(formatDateInputValue(editingExpense.occurredAt));
      setNoteInput(editingExpense.note ?? '');
      setTags([...editingExpense.tags]);
      setScheduleNameInput('');
      setFrequency('MONTHLY');
      setDueDayInput('15');
      setDueLabelInput('');
      setNextDueDateInput('');
      setIsAutoPaid(false);
      setTotalTermsInput('');
      setRemainingTermsInput('');
    } else {
      const startMode = initialMode;
      setMode(startMode);
      setAmountInput('');
      setSelectedAccountId(defaultAccountId ?? accounts[0]?.id ?? '');
      setSelectedCategoryId(pickDefaultCategoryForMode(startMode));
      setMerchantInput('');
      setDateInput(formatDateInputValue(new Date().toISOString()));
      setNoteInput('');
      setTags([]);
      setScheduleNameInput('');
      setFrequency('MONTHLY');
      setDueDayInput('15');
      setDueLabelInput('');
      setNextDueDateInput('');
      setIsAutoPaid(false);
      setTotalTermsInput('');
      setRemainingTermsInput('');
    }

    setNewTagInput('');
    setShowCustomCategoryForm(false);
    setCustomCategoryName('');
    setCustomCategoryIcon(CUSTOM_CATEGORY_ICONS[0]);
    setConfirmingDelete(false);
    setFormError(null);
    // Intentionally keyed on formSessionKey so toggling `visible` for SplitEditorModal preserves draft edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSessionKey]);

  // Sync updated total when returning from SplitEditorModal
  useEffect(() => {
    if (externalAmountSync !== null && externalAmountSync !== undefined) {
      setAmountInput(externalAmountSync);
      setFormError(null);
      onClearExternalAmountSync?.();
    }
  }, [externalAmountSync, onClearExternalAmountSync]);

  const isEditing = Boolean(editingExpense || editingCommitment);

  const expensePresets = useMemo(
    () => presets.filter((p) => p.type === 'EXPENSE'),
    [presets],
  );

  const selectableTags = useMemo(() => {
    const merged = new Set<string>([...knownTags, ...tags]);
    return Array.from(merged);
  }, [knownTags, tags]);

  const parsedAmountMinor = useMemo(
    () => parseDecimalToMinorUnits(amountInput),
    [amountInput],
  );

  const hasSplits = mode === 'ONE_TIME' && draftSplits.length >= 2;
  const splitRemainderMinor = useMemo(() => {
    if (!hasSplits) return 0;
    const baseMinor = parsedAmountMinor !== null && parsedAmountMinor > 0 ? parsedAmountMinor : 0;
    return computeSplitRemainder(
      baseMinor,
      draftSplits.map((s) => s.amountMinor),
    );
  }, [hasSplits, parsedAmountMinor, draftSplits]);

  const totalTermsTrimmed = totalTermsInput.trim();
  const remainingTermsTrimmed = remainingTermsInput.trim();
  const parsedTotalTerms = /^\d+$/.test(totalTermsTrimmed)
    ? Number.parseInt(totalTermsTrimmed, 10)
    : NaN;
  const parsedRemainingTerms = /^\d+$/.test(remainingTermsTrimmed)
    ? Number.parseInt(remainingTermsTrimmed, 10)
    : NaN;

  const installmentPreview = useMemo(() => {
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
    const completedTerms = parsedTotalTerms - parsedRemainingTerms;
    return {
      totalLoanMinor: parsedTotalTerms * parsedAmountMinor,
      totalTerms: parsedTotalTerms,
      remainingTerms: parsedRemainingTerms,
      completedTerms,
      remainingBalanceMinor: parsedRemainingTerms * parsedAmountMinor,
    };
  }, [mode, parsedTotalTerms, parsedRemainingTerms, parsedAmountMinor]);

  const isBusy = isSaving || isDeleting || isCreatingCategory;

  const handleSelectMode = (nextMode: ExpenseFormMode) => {
    if (isEditing) return;
    setMode(nextMode);
    setFormError(null);
    if (nextMode !== 'ONE_TIME') {
      onChangeDraftSplits([]);
    }
    if (nextMode === 'INSTALLMENT') {
      const loansCat = expenseCategories.find((c) => c.id === 'cat-loans');
      if (loansCat) setSelectedCategoryId(loansCat.id);
    } else if (nextMode === 'RECURRING') {
      if (!selectedCategoryId || selectedCategoryId === 'cat-loans') {
        const subOrDues =
          expenseCategories.find((c) => c.id === 'cat-subscription') ??
          expenseCategories.find((c) => c.id === 'cat-dues');
        if (subOrDues) setSelectedCategoryId(subOrDues.id);
      }
    }
  };

  const handleApplyPreset = (preset: QuickPreset) => {
    setAmountInput(minorUnitsToDecimalInput(preset.amountMinor));
    if (preset.accountId && accounts.some((a) => a.id === preset.accountId)) {
      setSelectedAccountId(preset.accountId);
    }
    if (preset.categoryId) {
      setSelectedCategoryId(preset.categoryId);
    }
    if (preset.merchant) {
      setMerchantInput(preset.merchant);
    }
    if (preset.tags.length > 0) {
      setTags([...preset.tags]);
    }
    onChangeDraftSplits([]);
    setFormError(null);
  };

  const handleToggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleAddCustomTag = () => {
    const normalized = newTagInput.trim().replace(/^#+/, '');
    if (!normalized) {
      return;
    }
    const alreadyPresent = tags.some(
      (t) => t.toLowerCase() === normalized.toLowerCase(),
    );
    if (!alreadyPresent) {
      setTags((prev) => [...prev, normalized]);
    }
    setNewTagInput('');
  };

  const handleCreateCustomCategory = async () => {
    const trimmed = customCategoryName.trim();
    if (!trimmed) {
      setFormError('Please enter a category name.');
      return;
    }

    setFormError(null);
    try {
      setIsCreatingCategory(true);
      const created = await onCreateCategory({
        name: trimmed,
        type: 'EXPENSE',
        icon: customCategoryIcon,
        color: DEFAULT_CUSTOM_CATEGORY_COLOR,
      });
      setSelectedCategoryId(created.id);
      onChangeDraftSplits([]);
      setCustomCategoryName('');
      setShowCustomCategoryForm(false);
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Failed to create category.',
      );
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleSavePress = async () => {
    if (parsedAmountMinor === null || parsedAmountMinor <= 0) {
      setFormError('Please enter an amount greater than 0.');
      return;
    }

    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) {
      setFormError('Please select an account.');
      return;
    }

    if (mode === 'ONE_TIME') {
      const occurredAtIso = parseDateInputToIso(dateInput, editingExpense?.occurredAt);
      if (!occurredAtIso) {
        setFormError('Please enter a valid date in YYYY-MM-DD format.');
        return;
      }

      if (hasSplits) {
        if (splitRemainderMinor !== 0) {
          setFormError(
            `Split amounts differ from total by ${formatMinorUnits(
              Math.abs(splitRemainderMinor),
              account.currency,
            )}.`,
          );
          return;
        }
      } else if (!selectedCategoryId) {
        setFormError('Please select a category.');
        return;
      }

      const normalizedTags = Array.from(
        new Set(
          tags
            .map((t) => t.trim().replace(/^#+/, ''))
            .filter((t) => t.length > 0),
        ),
      );

      const trimmedMerchant = merchantInput.trim();
      const trimmedNote = noteInput.trim();

      setFormError(null);
      try {
        await onSave({
          ...(editingExpense ? { id: editingExpense.id } : {}),
          input: {
            type: 'EXPENSE',
            amountMinor: parsedAmountMinor,
            currency: editingExpense?.currency ?? account.currency ?? DEFAULT_CURRENCY,
            accountId: account.id,
            categoryId: hasSplits ? undefined : selectedCategoryId,
            splits: hasSplits ? draftSplits : undefined,
            merchant: trimmedMerchant.length > 0 ? trimmedMerchant : undefined,
            tags: normalizedTags,
            note: trimmedNote.length > 0 ? trimmedNote : undefined,
            receiptUri: editingExpense?.receiptUri,
            occurredAt: occurredAtIso,
          },
        });
      } catch (error: unknown) {
        setFormError(
          error instanceof Error ? error.message : 'Failed to save expense. Please try again.',
        );
      }
      return;
    }

    // Scheduled Recurring / Installment save
    const trimmedName = scheduleNameInput.trim();
    if (!trimmedName) {
      setFormError(
        mode === 'INSTALLMENT'
          ? 'Please enter a name for this loan or installment.'
          : 'Please enter a name for this recurring expense.',
      );
      return;
    }

    if (!selectedCategoryId) {
      setFormError('Please select a category.');
      return;
    }

    const parsedDueDay = Number.parseInt(dueDayInput.trim(), 10);
    if (!Number.isFinite(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
      setFormError('Due day must be a number between 1 and 31.');
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
        setFormError('Remaining terms must be a whole number (0 or greater).');
        return;
      }
      if (parsedRemainingTerms > parsedTotalTerms) {
        setFormError('Remaining terms cannot exceed total terms.');
        return;
      }
      totalInstallments = parsedTotalTerms;
      paidInstallments = parsedTotalTerms - parsedRemainingTerms;
    } else {
      totalInstallments = undefined;
      paidInstallments = 0;
    }

    const trimmedDueLabel = dueLabelInput.trim();
    const trimmedNote = noteInput.trim();
    const isPaidOff =
      totalInstallments !== undefined && paidInstallments >= totalInstallments;

    const nextDueDateValue =
      trimmedNextDueDate.length > 0 ? trimmedNextDueDate : undefined;

    setFormError(null);
    try {
      await onSaveCommitment({
        ...(editingCommitment ? { id: editingCommitment.id } : {}),
        name: trimmedName,
        kind: mode === 'INSTALLMENT' ? 'INSTALLMENT' : 'RECURRING',
        amountMinor: parsedAmountMinor,
        currency: editingCommitment?.currency ?? account.currency ?? DEFAULT_CURRENCY,
        accountId: account.id,
        categoryId: selectedCategoryId,
        frequency,
        dueDay: parsedDueDay,
        dueLabel: trimmedDueLabel.length > 0 ? trimmedDueLabel : undefined,
        nextDueDate: nextDueDateValue,
        previousNextDueDate:
          editingCommitment?.nextDueDate === nextDueDateValue
            ? editingCommitment?.previousNextDueDate
            : undefined,
        isAutoPaid,
        isActive: isPaidOff ? false : (editingCommitment ? editingCommitment.isActive : true),
        totalInstallments,
        paidInstallments,
        lastPaidPeriod: editingCommitment?.lastPaidPeriod,
        lastPaidTransactionId: editingCommitment?.lastPaidTransactionId,
        notes: trimmedNote.length > 0 ? trimmedNote : undefined,
      });
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Failed to save scheduled expense.',
      );
    }
  };

  const handleDeletePress = async () => {
    setFormError(null);
    try {
      if (editingCommitment && onDeleteCommitment) {
        await onDeleteCommitment(editingCommitment.id);
      } else if (editingExpense && onDelete) {
        await onDelete(editingExpense.id);
      }
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Could not delete this item.',
      );
    }
  };

  const todayStr = formatDateInputValue(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = formatDateInputValue(yesterdayDate.toISOString());

  const activeAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const activeCurrency =
    editingCommitment?.currency ??
    editingExpense?.currency ??
    activeAccount?.currency ??
    DEFAULT_CURRENCY;

  const canDeleteCurrent = Boolean(
    (editingExpense && onDelete) || (editingCommitment && onDeleteCommitment),
  );

  const modalTitle = editingCommitment
    ? mode === 'INSTALLMENT'
      ? 'Edit Loan / Installment'
      : 'Edit Recurring Expense'
    : editingExpense
      ? 'Edit Expense'
      : mode === 'INSTALLMENT'
        ? 'Add Loan / Installment'
        : mode === 'RECURRING'
          ? 'Add Recurring Expense'
          : 'Add Expense';

  const modalSubtitle =
    mode === 'INSTALLMENT'
      ? 'Track fixed-term payments and remaining loan balance'
      : mode === 'RECURRING'
        ? 'Schedule dues, bills, or subscriptions with due dates'
        : 'Record spending and keep balances in sync';

  const primarySaveLabel = isEditing
    ? 'Save Changes'
    : mode === 'INSTALLMENT'
      ? 'Save Loan / Installment'
      : mode === 'RECURRING'
        ? 'Save Recurring Expense'
        : 'Save Expense';

  const dueDayNumeric = Number.parseInt(dueDayInput.trim(), 10);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isBusy) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        className="flex-1 bg-slate-950/60 items-center justify-center p-3 sm:p-6"
      >
        <Pressable
          onPress={() => {
            if (!isBusy) onClose();
          }}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel="Close dialog backdrop"
          className="absolute inset-0"
        />
        <View
          style={{ width: modalWidth, maxHeight: '92%' }}
          className="relative z-10 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: isWide ? 28 : 20,
              gap: isWide ? 20 : 16,
            }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                  {modalTitle}
                </ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                  {modalSubtitle}
                </ThemedText>
              </View>

              <Pressable
                onPress={onClose}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                className="min-w-[44px] min-h-[44px] rounded-xl items-center justify-center bg-slate-100 dark:bg-slate-800 active:opacity-75"
              >
                <ThemedText className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  ✕
                </ThemedText>
              </Pressable>
            </View>

            {/* Expense Type Segmented Selector */}
            {!isEditing ? (
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Expense Type
                </ThemedText>
                <View className="flex-row flex-wrap gap-2">
                  {MODE_OPTIONS.map((opt) => {
                    const isSelected = mode === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => handleSelectMode(opt.key)}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${opt.label}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex-row items-center justify-center ${
                          isWide ? 'flex-1' : ''
                        } ${
                          isSelected
                            ? 'bg-brand-500 border-brand-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
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
              </View>
            ) : null}

            {/* Form Error */}
            {formError ? (
              <View
                accessibilityRole="alert"
                className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80"
              >
                <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {formError}
                </ThemedText>
              </View>
            ) : null}

            {/* Quick Expense Presets (One-Time Add mode) */}
            {!isEditing && mode === 'ONE_TIME' && expensePresets.length > 0 && (
              <View className="gap-1.5">
                <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quick Presets
                </ThemedText>
                <View className="flex-row flex-wrap gap-2">
                  {expensePresets.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() => handleApplyPreset(preset)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${preset.label} preset`}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center gap-1.5 active:opacity-75"
                    >
                      <ThemedText className="text-sm">{preset.icon}</ThemedText>
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {preset.label} • {formatMinorUnits(preset.amountMinor, activeCurrency)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Primary Row: Amount + (Date for One-Time OR Name for Recurring/Loan) */}
            <View className={isWide ? 'flex-row items-start gap-5' : 'gap-4'}>
              {mode !== 'ONE_TIME' && (
                <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {mode === 'INSTALLMENT' ? 'Loan / Installment Name' : 'Recurring Expense Name'}
                  </ThemedText>
                  <TextInput
                    value={scheduleNameInput}
                    onChangeText={(text) => {
                      setScheduleNameInput(text);
                      if (formError) setFormError(null);
                    }}
                    placeholder={
                      mode === 'INSTALLMENT'
                        ? 'e.g. Car Loan, Phone Installment'
                        : 'e.g. Apartment Rent, Netflix, Internet'
                    }
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel="Scheduled expense name"
                    editable={!isBusy}
                    className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base"
                  />
                </View>
              )}

              {/* Amount Input & Quick Amounts */}
              <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {mode === 'INSTALLMENT' ? 'Payment Per Term' : 'Amount'}
                </ThemedText>
                <View className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex-row items-center">
                  <ThemedText className="text-lg font-bold text-slate-400 dark:text-slate-500 mr-2">
                    {DEFAULT_CURRENCY_SYMBOL}
                  </ThemedText>
                  <TextInput
                    value={amountInput}
                    onChangeText={(text) => {
                      setAmountInput(text);
                      if (formError) setFormError(null);
                    }}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel="Expense amount"
                    keyboardType="decimal-pad"
                    editable={!isBusy}
                    className="flex-1 h-full text-slate-900 dark:text-slate-100 text-base font-bold"
                  />
                </View>
                <View className="flex-row flex-wrap gap-2 pt-0.5">
                  {QUICK_AMOUNT_PRESETS.map((minor) => (
                    <Pressable
                      key={minor}
                      onPress={() => {
                        setAmountInput(minorUnitsToDecimalInput(minor));
                        if (formError) setFormError(null);
                      }}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Set amount ${formatMinorUnits(minor, activeCurrency)}`}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {formatMinorUnits(minor, activeCurrency)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Date Input (One-Time only) */}
              {mode === 'ONE_TIME' && (
                <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Date (YYYY-MM-DD)
                  </ThemedText>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Pressable
                      onPress={() => {
                        setDateInput(todayStr);
                        if (formError) setFormError(null);
                      }}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Set date to today"
                      accessibilityState={{ selected: dateInput === todayStr }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                        dateInput === todayStr
                          ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-semibold ${
                          dateInput === todayStr
                            ? 'text-brand-700 dark:text-brand-300'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Today
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setDateInput(yesterdayStr);
                        if (formError) setFormError(null);
                      }}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Set date to yesterday"
                      accessibilityState={{ selected: dateInput === yesterdayStr }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                        dateInput === yesterdayStr
                          ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText
                        className={`text-xs font-semibold ${
                          dateInput === yesterdayStr
                            ? 'text-brand-700 dark:text-brand-300'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Yesterday
                      </ThemedText>
                    </Pressable>

                    <TextInput
                      value={dateInput}
                      onChangeText={(text) => {
                        setDateInput(text);
                        if (formError) setFormError(null);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Expense date"
                      keyboardType="numbers-and-punctuation"
                      editable={!isBusy}
                      className="flex-1 min-w-[130px] h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Category or Split Summary */}
            <View className="gap-2">
              <View className="flex-row items-center justify-between gap-2">
                <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Category
                </ThemedText>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => setShowCustomCategoryForm((prev) => !prev)}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Create custom expense category"
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {showCustomCategoryForm ? 'Close' : '+ Custom'}
                    </ThemedText>
                  </Pressable>

                  {mode === 'ONE_TIME' && (
                    <Pressable
                      onPress={() =>
                        onOpenSplitEditor(
                          parsedAmountMinor !== null && parsedAmountMinor > 0
                            ? parsedAmountMinor
                            : 10000,
                          selectedCategoryId || expenseCategories[0]?.id,
                        )
                      }
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={
                        hasSplits ? 'Edit split categories' : 'Split across categories'
                      }
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-800/70 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-bold text-brand-600 dark:text-brand-300">
                        {hasSplits ? '🔀 Edit Splits' : '🔀 Split'}
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Inline Custom Category Creator */}
              {showCustomCategoryForm && (
                <View className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 gap-2.5">
                  <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    New Custom Category
                  </ThemedText>
                  <TextInput
                    value={customCategoryName}
                    onChangeText={setCustomCategoryName}
                    placeholder="e.g. Pets, Education, Parking"
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel="Custom category name"
                    editable={!isBusy}
                    className="h-12 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                  />
                  <View className="flex-row flex-wrap gap-1.5">
                    {CUSTOM_CATEGORY_ICONS.map((icon) => {
                      const selected = customCategoryIcon === icon;
                      return (
                        <Pressable
                          key={icon}
                          onPress={() => setCustomCategoryIcon(icon)}
                          accessibilityRole="button"
                          accessibilityLabel={`Select category icon ${icon}`}
                          accessibilityState={{ selected }}
                          className={`min-w-[44px] min-h-[44px] rounded-xl border items-center justify-center ${
                            selected
                              ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <ThemedText className="text-base">{icon}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    onPress={handleCreateCustomCategory}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Save custom category"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
                  >
                    {isCreatingCategory ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <ThemedText className="text-xs font-bold text-white">
                        Create Category
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              )}

              {hasSplits ? (
                <View className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 gap-2.5">
                  <View className="flex-row flex-wrap gap-1.5">
                    {draftSplits.map((split) => {
                      const cat = expenseCategories.find((c) => c.id === split.categoryId);
                      return (
                        <View
                          key={split.id}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                        >
                          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {cat?.icon ?? '🏷️'} {cat?.name ?? 'Category'}:{' '}
                            {formatMinorUnits(split.amountMinor, activeCurrency)}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>

                  {splitRemainderMinor !== 0 && (
                    <ThemedText className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      ⚠️ Split differs from amount by{' '}
                      {formatMinorUnits(Math.abs(splitRemainderMinor), activeCurrency)}
                    </ThemedText>
                  )}

                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => onChangeDraftSplits([])}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Clear split categories"
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        Clear Splits
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {expenseCategories.map((cat) => {
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          setSelectedCategoryId(cat.id);
                          if (formError) setFormError(null);
                        }}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Select category ${cat.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                          isSelected
                            ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                        }`}
                      >
                        {isSelected && (
                          <ThemedText className="text-xs font-extrabold text-brand-600 dark:text-brand-300">
                            ✓
                          </ThemedText>
                        )}
                        <ThemedText className="text-sm">{cat.icon}</ThemedText>
                        <ThemedText
                          className={`text-xs font-semibold ${
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
              )}
            </View>

            {/* Account Selector */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Paid From Account
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {accounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <Pressable
                      key={acc.id}
                      onPress={() => {
                        setSelectedAccountId(acc.id);
                        if (formError) setFormError(null);
                      }}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay from ${acc.name}`}
                      accessibilityState={{ selected: isSelected }}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                        isSelected
                          ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                          : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 active:opacity-75'
                      }`}
                    >
                      <ThemedText className="text-sm">{acc.icon}</ThemedText>
                      <ThemedText
                        className={`text-xs font-semibold ${
                          isSelected
                            ? 'text-brand-700 dark:text-brand-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {acc.name} ({getAccountTypeLabel(acc.accountType)}) •{' '}
                        {formatMinorUnits(acc.balanceMinor, acc.currency)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Scheduled / Loan Specific Fields */}
            {mode !== 'ONE_TIME' && (
              <>
                {/* Frequency & Due Day Row */}
                <View className={isWide ? 'flex-row items-start gap-5' : 'gap-4'}>
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Billing Frequency
                    </ThemedText>
                    <View className="flex-row flex-wrap gap-2">
                      {FREQUENCY_OPTIONS.map((opt) => {
                        const isSelected = frequency === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            onPress={() => setFrequency(opt.value)}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Frequency ${opt.label}`}
                            accessibilityState={{ selected: isSelected }}
                            className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
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
                              {opt.label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Due Day of Month (1 - 31)
                    </ThemedText>
                    <View className="flex-row flex-wrap items-center gap-2">
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
                        editable={!isBusy}
                        className="w-20 h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold text-center"
                      />
                      {QUICK_DAY_PRESETS.map((day) => {
                        const isSelected = dueDayNumeric === day;
                        return (
                          <Pressable
                            key={day}
                            onPress={() => {
                              setDueDayInput(String(day));
                              if (formError) setFormError(null);
                            }}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Due day ${day}`}
                            accessibilityState={{ selected: isSelected }}
                            className={`min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-xl border items-center justify-center ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
                            }`}
                          >
                            <ThemedText
                              className={`text-xs font-bold ${
                                isSelected
                                  ? 'text-brand-700 dark:text-brand-300'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {day}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Next Due Date (Optional) */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Next Due Date (Optional)
                  </ThemedText>
                  <View className="flex-row flex-wrap items-center gap-2">
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
                      placeholder="YYYY-MM-DD, e.g. 2026-12-15"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Next due date"
                      editable={!isBusy}
                      className="flex-1 min-w-[200px] h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium"
                    />
                    {(
                      [
                        { key: 'TODAY', label: 'Today' },
                        { key: 'NEXT_WEEK', label: '+1 Week' },
                        { key: 'NEXT_MONTH', label: 'Next Month' },
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
                            setNextDueDateInput(presetDate);
                            const parsed = parseCalendarDate(presetDate);
                            if (parsed) {
                              setDueDayInput(String(parsed.getDate()));
                            }
                            if (formError) setFormError(null);
                          }}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Set next due date to ${preset.label}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
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
                    {nextDueDateInput.trim().length > 0 && (
                      <Pressable
                        onPress={() => {
                          setNextDueDateInput('');
                          if (formError) setFormError(null);
                        }}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Clear next due date"
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                      >
                        <ThemedText className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Clear
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Schedule Label (Optional) */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Schedule Label (Optional)
                  </ThemedText>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <TextInput
                      value={dueLabelInput}
                      onChangeText={(text) => {
                        setDueLabelInput(text);
                        if (formError) setFormError(null);
                      }}
                      placeholder="e.g. PAYROLL, April 25, Weekly, No fixed date"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Schedule label"
                      editable={!isBusy}
                      className="flex-1 min-w-[200px] h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium"
                    />
                    {(['PAYROLL', 'Weekly', 'No fixed date'] as const).map((presetLabel) => {
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
                            if (presetLabel === 'Weekly') {
                              setFrequency('WEEKLY');
                            } else if (presetLabel === 'PAYROLL') {
                              setIsAutoPaid(true);
                            }
                          }}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Set schedule label ${presetLabel}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
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
                  </View>
                </View>

                {/* Term Details (Optional for both Recurring & Loans) */}
                <View className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 gap-3">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Term Schedule (Optional)
                  </ThemedText>

                  <View className={isWide ? 'flex-row items-start gap-4' : 'gap-3'}>
                    <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Total Terms
                      </ThemedText>
                      <TextInput
                        value={totalTermsInput}
                        onChangeText={(text) => {
                          setTotalTermsInput(text);
                          if (formError) setFormError(null);
                        }}
                        placeholder="Optional, e.g. 12"
                        placeholderTextColor={theme.textSecondary}
                        accessibilityLabel="Total terms"
                        keyboardType="number-pad"
                        editable={!isBusy}
                        className="h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base font-bold"
                      />
                    </View>

                    <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Remaining Terms
                      </ThemedText>
                      <TextInput
                        value={remainingTermsInput}
                        onChangeText={(text) => {
                          setRemainingTermsInput(text);
                          if (formError) setFormError(null);
                        }}
                        placeholder="Optional, e.g. 6"
                        placeholderTextColor={theme.textSecondary}
                        accessibilityLabel="Remaining terms"
                        keyboardType="number-pad"
                        editable={!isBusy}
                        className="h-12 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base font-bold"
                      />
                    </View>
                  </View>

                  {installmentPreview && (
                    <ThemedText className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                      Total: {formatMinorUnits(installmentPreview.totalLoanMinor, activeCurrency)}{' '}
                      • Completed: {installmentPreview.completedTerms}/{installmentPreview.totalTerms}{' '}
                      • Remaining: {installmentPreview.remainingTerms} terms (
                      {formatMinorUnits(
                        installmentPreview.remainingBalanceMinor,
                        activeCurrency,
                      )}
                      )
                    </ThemedText>
                  )}
                </View>

                {/* Auto-Pay & Note Row */}
                <View className={isWide ? 'flex-row items-start gap-5' : 'gap-4'}>
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Auto-Pay
                    </ThemedText>
                    <View className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex-row items-center justify-between gap-3">
                      <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex-1">
                        Automatically debited on due date
                      </ThemedText>
                      <Switch
                        value={isAutoPaid}
                        onValueChange={setIsAutoPaid}
                        disabled={isBusy}
                        accessibilityLabel="Auto-pay enabled"
                      />
                    </View>
                  </View>

                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Note (Optional)
                    </ThemedText>
                    <TextInput
                      value={noteInput}
                      onChangeText={setNoteInput}
                      placeholder="Add details or reminder..."
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Scheduled expense note"
                      editable={!isBusy}
                      className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base"
                    />
                  </View>
                </View>
              </>
            )}

            {/* One-Time Specific Fields (Merchant, Note, Tags) */}
            {mode === 'ONE_TIME' && (
              <>
                <View className={isWide ? 'flex-row items-start gap-5' : 'gap-4'}>
                  {/* Merchant / Payee */}
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Merchant / Payee (Optional)
                    </ThemedText>
                    <TextInput
                      value={merchantInput}
                      onChangeText={setMerchantInput}
                      placeholder="e.g. Whole Foods, Starbucks, Grab"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Merchant or payee"
                      editable={!isBusy}
                      className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base"
                    />
                    {recentMerchants.length > 0 && (
                      <View className="flex-row flex-wrap gap-1.5 pt-0.5">
                        {recentMerchants.slice(0, 6).map((merchant) => {
                          const selected =
                            merchantInput.trim().toLowerCase() === merchant.toLowerCase();
                          return (
                            <Pressable
                              key={merchant}
                              onPress={() => setMerchantInput(merchant)}
                              disabled={isBusy}
                              accessibilityRole="button"
                              accessibilityLabel={`Use merchant ${merchant}`}
                              accessibilityState={{ selected }}
                              className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                                selected
                                  ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
                              }`}
                            >
                              <ThemedText
                                className={`text-xs font-semibold ${
                                  selected
                                    ? 'text-brand-700 dark:text-brand-300'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {merchant}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Note Input */}
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Note (Optional)
                    </ThemedText>
                    <TextInput
                      value={noteInput}
                      onChangeText={setNoteInput}
                      placeholder="Add details or reminder..."
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Expense note"
                      editable={!isBusy}
                      className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base"
                    />
                  </View>
                </View>

                {/* Tags Selector */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Tags (Optional)
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {selectableTags.map((tag) => {
                      const isSelected = tags.includes(tag);
                      return (
                        <Pressable
                          key={tag}
                          onPress={() => handleToggleTag(tag)}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Toggle tag ${tag}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-brand-700 dark:text-brand-300'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isSelected ? `✓ #${tag}` : `#${tag}`}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View className="flex-row items-center gap-2 pt-1">
                    <TextInput
                      value={newTagInput}
                      onChangeText={setNewTagInput}
                      onSubmitEditing={handleAddCustomTag}
                      placeholder="Add custom tag..."
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="New custom tag"
                      editable={!isBusy}
                      className="flex-1 h-12 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                    />
                    <Pressable
                      onPress={handleAddCustomTag}
                      disabled={isBusy || !newTagInput.trim()}
                      accessibilityRole="button"
                      accessibilityLabel="Add tag"
                      className={`min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 items-center justify-center ${
                        !newTagInput.trim() ? 'opacity-50' : 'active:opacity-80'
                      }`}
                    >
                      <ThemedText className="text-xs font-bold text-white">Add</ThemedText>
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            {/* Modal Actions */}
            <View
              className={
                isWide
                  ? 'flex-row-reverse items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80'
                  : 'gap-2.5 pt-2'
              }
            >
              <Pressable
                onPress={handleSavePress}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={primarySaveLabel}
                className={`min-h-[44px] py-3 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-md shadow-brand-500/25 ${
                  isWide ? 'min-w-[200px] px-6' : 'w-full'
                } ${isBusy ? 'opacity-70' : ''}`}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors.dark.text} />
                ) : (
                  <ThemedText className="text-sm font-bold text-white">
                    {primarySaveLabel}
                  </ThemedText>
                )}
              </Pressable>

              <View className="flex-row items-center gap-2.5">
                {confirmingDelete && canDeleteCurrent ? (
                  <>
                    <Pressable
                      onPress={() => setConfirmingDelete(false)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Keep item"
                      className={`${isWide ? 'px-4' : 'flex-1'} min-h-[44px] py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75`}
                    >
                      <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Keep Item
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={handleDeletePress}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm delete"
                      className={`${isWide ? 'px-4' : 'flex-1'} min-h-[44px] py-2.5 rounded-xl bg-rose-600 active:bg-rose-700 items-center justify-center`}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={Colors.dark.text} />
                      ) : (
                        <ThemedText className="text-xs font-bold text-white">
                          Confirm Delete
                        </ThemedText>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={onClose}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                      className={`${isWide ? 'px-5' : 'flex-1'} min-h-[44px] py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75`}
                    >
                      <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Cancel
                      </ThemedText>
                    </Pressable>

                    {canDeleteCurrent ? (
                      <Pressable
                        onPress={() => setConfirmingDelete(true)}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Delete item"
                        className={`${isWide ? 'px-4' : 'flex-1'} min-h-[44px] py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 items-center justify-center active:opacity-75`}
                      >
                        <ThemedText className="text-xs font-bold text-rose-600 dark:text-rose-400">
                          Delete
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
