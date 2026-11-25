import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  computeSplitRemainder,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCY,
  formatDateInputValue,
  formatMinorUnits,
  getAccountTypeLabel,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  rankCategoriesByFrequency,
  type Account,
  type Category,
  type CreateTransactionInput,
  type Transaction,
  type TransactionSplit,
  type TransactionType,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { Colors, TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';

import {
  useCreateCustomCategory,
  useCreateTransaction,
  useDeleteTransaction,
  useIncomeSources,
  useUpdateTransaction,
} from '../hooks/use-transactions';
import { SplitEditorModal } from './split-editor-modal';

export interface TransactionFormModalProps {
  visible: boolean;
  editingTransaction: Transaction | null;
  initialType?: TransactionType;
  initialAccountId?: string;
  accounts: readonly Account[];
  categories: readonly Category[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onDeleted: (message: string) => void;
}

const TYPE_OPTIONS: readonly { key: TransactionType; label: string }[] = [
  { key: 'INCOME', label: 'Incoming' },
  { key: 'EXPENSE', label: 'Outgoing' },
  { key: 'TRANSFER', label: 'Transfer' },
];

const CATEGORY_SWATCH_PALETTE: readonly { label: string; color: string }[] = (() => {
  const candidates = [
    { label: 'Forest', color: Colors.light.primary },
    { label: 'Pine', color: Colors.light.positive },
    { label: 'Teal', color: Colors.light.info },
    { label: 'Ochre', color: Colors.light.warning },
    { label: 'Terracotta', color: Colors.light.negative },
    ...DEFAULT_CATEGORIES.map((c) => ({ label: c.name, color: c.color })),
  ];
  const seen = new Set<string>();
  const unique: { label: string; color: string }[] = [];
  for (const item of candidates) {
    if (!seen.has(item.color)) {
      seen.add(item.color);
      unique.push(item);
    }
    if (unique.length >= 8) {
      break;
    }
  }
  return unique;
})();

function buildCategoryMonogram(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 2) || 'TX';
}

function validateAmountText(raw: string): string | null {
  if (raw.trim().length === 0) {
    return 'Please enter an amount greater than 0.';
  }
  const parsed = parseDecimalToMinorUnits(raw);
  if (parsed === null) {
    return 'Enter a valid amount with up to 2 decimal places.';
  }
  if (parsed <= 0) {
    return 'Please enter an amount greater than 0.';
  }
  return null;
}

function validateDateText(raw: string): string | null {
  if (!parseDateInputToIso(raw)) {
    return 'Please enter a valid date in YYYY-MM-DD format.';
  }
  return null;
}

function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const cleaned = part.trim().replace(/^#+/, '').slice(0, 32);
    if (cleaned.length > 0 && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
    if (result.length >= 20) {
      break;
    }
  }
  return result;
}

interface HorizontalAccountCardPickerProps {
  label: string;
  accounts: readonly Account[];
  selectedAccountId: string;
  disabledAccountId?: string;
  disabled?: boolean;
  onSelect: (accountId: string) => void;
}

function HorizontalAccountCardPicker({
  label,
  accounts,
  selectedAccountId,
  disabledAccountId,
  disabled = false,
  onSelect,
}: HorizontalAccountCardPickerProps) {
  const theme = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const scrollOffsetRef = useRef(0);

  const handleScrollBy = (deltaX: number) => {
    const nextX = Math.max(0, scrollOffsetRef.current + deltaX);
    scrollRef.current?.scrollTo({ x: nextX, animated: true });
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
          {label}
        </ThemedText>

        {accounts.length > 2 && (
          <View className="flex-row items-center gap-1.5">
            <Pressable
              onPress={() => handleScrollBy(-190)}
              accessibilityRole="button"
              accessibilityLabel={`Scroll ${label} left`}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <AppIcon name="chevronLeft" size={16} color={theme.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => handleScrollBy(190)}
              accessibilityRole="button"
              accessibilityLabel={`Scroll ${label} right`}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <AppIcon name="chevronRight" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        contentContainerStyle={{ gap: 10, paddingVertical: 2, paddingRight: 4 }}
      >
        {accounts.map((acc) => {
          const isDisabledAccount = acc.id === disabledAccountId;
          const isSelected = selectedAccountId === acc.id && !isDisabledAccount;
          const balanceFormatted = formatMinorUnits(
            acc.balanceMinor,
            acc.currency,
          );
          const isNegative = acc.balanceMinor < 0;

          return (
            <Pressable
              key={acc.id}
              onPress={() => onSelect(acc.id)}
              disabled={disabled || isDisabledAccount}
              accessibilityRole="button"
              accessibilityLabel={`Select ${label} ${acc.name}`}
              accessibilityState={{
                selected: isSelected,
                disabled: disabled || isDisabledAccount,
              }}
              className={`w-[176px] min-h-[108px] p-3.5 rounded-2xl justify-between ${
                isDisabledAccount
                  ? 'bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark opacity-45'
                  : isSelected
                    ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-2 border-brand-500 dark:border-brand-400'
                    : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-80'
              }`}
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="w-8 h-8 rounded-lg bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center">
                  <ThemedText className="text-base">{acc.icon}</ThemedText>
                </View>

                {isDisabledAccount ? (
                  <View className="px-2 py-0.5 rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText className="text-[10px] font-semibold text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Source
                    </ThemedText>
                  </View>
                ) : isSelected ? (
                  <AppIcon name="checkCircle" size={18} color={theme.primary} />
                ) : null}
              </View>

              <View className="gap-0.5 mt-2">
                <ThemedText
                  numberOfLines={1}
                  className={`text-sm font-bold ${
                    isSelected
                      ? 'text-brand-500 dark:text-brand-400'
                      : 'text-ledger-ink dark:text-ledger-ink-dark'
                  }`}
                >
                  {acc.name}
                </ThemedText>
                <ThemedText
                  numberOfLines={1}
                  className="text-[11px] font-medium text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
                >
                  {getAccountTypeLabel(acc.accountType)}
                </ThemedText>
              </View>

              <View className="mt-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                <ThemedText
                  numeric
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className={`text-sm font-extrabold ${
                    isNegative
                      ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                      : isSelected
                        ? 'text-brand-500 dark:text-brand-400'
                        : 'text-ledger-ink dark:text-ledger-ink-dark'
                  }`}
                >
                  {balanceFormatted}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function TransactionFormModal({
  visible,
  editingTransaction,
  initialType = 'EXPENSE',
  initialAccountId,
  accounts,
  categories,
  onClose,
  onSaved,
  onDeleted,
}: TransactionFormModalProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const modalWidth = Math.min(Math.max(windowWidth - (isWide ? 48 : 24), 280), 820);

  const createTransactionMutation = useCreateTransaction();
  const updateTransactionMutation = useUpdateTransaction();
  const deleteTransactionMutation = useDeleteTransaction();
  const createCategoryMutation = useCreateCustomCategory();
  const incomeSourcesQuery = useIncomeSources();
  const incomeSources = incomeSourcesQuery.data ?? [];

  const wasVisibleRef = useRef(false);
  const modalScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountInput, setAmountInput] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [incomeSourceId, setIncomeSourceId] = useState('');
  const [draftSplits, setDraftSplits] = useState<TransactionSplit[]>([]);
  const [isSplitEditorOpen, setIsSplitEditorOpen] = useState(false);

  const [dateInput, setDateInput] = useState(() =>
    formatDateInputValue(new Date().toISOString()),
  );
  const [dateTouched, setDateTouched] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [merchantInput, setMerchantInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  // Inline custom category creator state
  const [showCustomCategoryForm, setShowCustomCategoryForm] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customCategoryColor, setCustomCategoryColor] = useState<string>(
    CATEGORY_SWATCH_PALETTE[0]?.color ?? Colors.light.primary,
  );
  const [customCategoryError, setCustomCategoryError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize form state once when modal opens (preserving draft across SplitEditorModal toggle)
  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      setIsSplitEditorOpen(false);
      return;
    }

    if (wasVisibleRef.current) {
      return;
    }
    wasVisibleRef.current = true;

    if (editingTransaction) {
      const txType = editingTransaction.type;
      const categoryType = txType === 'INCOME' ? 'INCOME' : 'EXPENSE';
      const ranked = rankCategoriesByFrequency(categories, categoryType);

      setType(txType);
      setAmountInput(minorUnitsToDecimalInput(editingTransaction.amountMinor));
      setAccountId(editingTransaction.accountId);
      setToAccountId(editingTransaction.toAccountId ?? '');
      setCategoryId(
        txType === 'TRANSFER'
          ? ''
          : (editingTransaction.categoryId ?? ranked[0]?.id ?? ''),
      );
      setIncomeSourceId(
        txType === 'INCOME' ? (editingTransaction.incomeSourceId ?? '') : '',
      );
      setDraftSplits(
        txType !== 'TRANSFER' && editingTransaction.splits
          ? [...editingTransaction.splits]
          : [],
      );
      setDateInput(formatDateInputValue(editingTransaction.occurredAt));
      setMerchantInput(editingTransaction.merchant ?? '');
      setTagsInput(editingTransaction.tags.join(', '));
      setNoteInput(editingTransaction.note ?? '');
    } else {
      const startType = initialType;
      const defaultAcc =
        initialAccountId && accounts.some((a) => a.id === initialAccountId)
          ? initialAccountId
          : (accounts[0]?.id ?? '');
      const otherAcc = accounts.find((a) => a.id !== defaultAcc)?.id ?? '';
      const ranked =
        startType === 'TRANSFER'
          ? []
          : rankCategoriesByFrequency(categories, startType);

      setType(startType);
      setAmountInput('');
      setAccountId(defaultAcc);
      setToAccountId(startType === 'TRANSFER' ? otherAcc : '');
      setCategoryId(ranked[0]?.id ?? '');
      setIncomeSourceId('');
      setDraftSplits([]);
      setDateInput(formatDateInputValue(new Date().toISOString()));
      setMerchantInput('');
      setTagsInput('');
      setNoteInput('');
    }

    setAmountTouched(false);
    setAmountError(null);
    setDateTouched(false);
    setDateError(null);
    setShowCustomCategoryForm(false);
    setCustomCategoryName('');
    setCustomCategoryColor(
      CATEGORY_SWATCH_PALETTE[0]?.color ?? Colors.light.primary,
    );
    setCustomCategoryError(null);
    setConfirmingDelete(false);
    setFormError(null);
  }, [visible, editingTransaction, initialType, initialAccountId, accounts, categories]);

  const isEditing = Boolean(editingTransaction);
  const isBusy =
    createTransactionMutation.isPending ||
    updateTransactionMutation.isPending ||
    deleteTransactionMutation.isPending ||
    createCategoryMutation.isPending;
  const isSubmitting =
    createTransactionMutation.isPending || updateTransactionMutation.isPending;

  const filteredCategories = useMemo(() => {
    if (type === 'TRANSFER') {
      return [];
    }
    return rankCategoriesByFrequency(categories, type);
  }, [categories, type]);

  const parsedAmountMinor = useMemo(
    () => parseDecimalToMinorUnits(amountInput),
    [amountInput],
  );

  const hasSplits = type !== 'TRANSFER' && draftSplits.length >= 2;

  const splitRemainderMinor = useMemo(() => {
    if (!hasSplits) {
      return 0;
    }
    const baseMinor =
      parsedAmountMinor !== null && parsedAmountMinor > 0 ? parsedAmountMinor : 0;
    return computeSplitRemainder(
      baseMinor,
      draftSplits.map((s) => s.amountMinor),
    );
  }, [hasSplits, parsedAmountMinor, draftSplits]);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const activeCurrency =
    editingTransaction?.currency ?? selectedAccount?.currency ?? DEFAULT_CURRENCY;

  const handleSelectType = (nextType: TransactionType) => {
    if (nextType === type || isBusy) {
      return;
    }
    setType(nextType);
    setFormError(null);

    if (nextType === 'TRANSFER') {
      setToAccountId((prev) =>
        prev && prev !== accountId
          ? prev
          : (accounts.find((a) => a.id !== accountId)?.id ?? ''),
      );
      setCategoryId('');
      setIncomeSourceId('');
      setDraftSplits([]);
      setShowCustomCategoryForm(false);
      setCustomCategoryError(null);
    } else {
      setToAccountId('');
      if (nextType !== 'INCOME') {
        setIncomeSourceId('');
      }
      setDraftSplits([]);
      const nextCategories = rankCategoriesByFrequency(categories, nextType);
      const currentMatchesType = nextCategories.some((c) => c.id === categoryId);
      if (!currentMatchesType) {
        setCategoryId(nextCategories[0]?.id ?? '');
      }
    }
  };

  const showModalError = (message: string) => {
    setFormError(message);
    modalScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleOpenSplitEditor = () => {
    if (parsedAmountMinor === null || parsedAmountMinor <= 0) {
      const msg = 'Enter an amount greater than 0 before splitting across categories.';
      setAmountTouched(true);
      setAmountError(msg);
      showModalError(msg);
      return;
    }
    if (filteredCategories.length === 0) {
      showModalError('Create or select at least one category before splitting.');
      return;
    }
    setFormError(null);
    setIsSplitEditorOpen(true);
  };

  const handleCreateCustomCategory = async () => {
    if (type === 'TRANSFER') {
      return;
    }
    const trimmed = customCategoryName.trim();
    if (!trimmed) {
      setCustomCategoryError('Please enter a category name.');
      return;
    }

    setCustomCategoryError(null);
    setFormError(null);
    try {
      const created = await createCategoryMutation.mutateAsync({
        name: trimmed,
        type,
        icon: buildCategoryMonogram(trimmed),
        color: customCategoryColor,
      });
      setCategoryId(created.id);
      setDraftSplits([]);
      setCustomCategoryName('');
      setShowCustomCategoryForm(false);
    } catch (error: unknown) {
      setCustomCategoryError(
        getUserErrorMessage(error, 'Failed to create category.'),
      );
    }
  };

  const handleSubmit = async () => {
    const nextAmountErr = validateAmountText(amountInput);
    const nextDateErr = validateDateText(dateInput);
    setAmountTouched(true);
    setDateTouched(true);
    setAmountError(nextAmountErr);
    setDateError(nextDateErr);

    if (nextAmountErr) {
      showModalError(nextAmountErr);
      return;
    }
    if (nextDateErr) {
      showModalError(nextDateErr);
      return;
    }

    if (parsedAmountMinor === null || parsedAmountMinor <= 0) {
      showModalError('Please enter an amount greater than 0.');
      return;
    }

    const sourceAccount = accounts.find((a) => a.id === accountId);
    if (!sourceAccount) {
      showModalError('Please select an account.');
      return;
    }

    if (type === 'TRANSFER') {
      const destAccount = accounts.find((a) => a.id === toAccountId);
      if (!destAccount) {
        showModalError('Please select a destination account for this transfer.');
        return;
      }
      if (destAccount.id === sourceAccount.id) {
        showModalError('From and To accounts must be different.');
        return;
      }
    } else if (hasSplits) {
      if (splitRemainderMinor !== 0) {
        showModalError(
          `Split amounts differ from total by ${formatMinorUnits(
            Math.abs(splitRemainderMinor),
            activeCurrency,
          )}.`,
        );
        return;
      }
    } else if (!categoryId || !filteredCategories.some((c) => c.id === categoryId)) {
      showModalError('Please select a category.');
      return;
    }

    const todayStr = formatDateInputValue(new Date().toISOString());
    const preserveIso =
      editingTransaction &&
      formatDateInputValue(editingTransaction.occurredAt) === dateInput.trim()
        ? editingTransaction.occurredAt
        : !editingTransaction && dateInput.trim() === todayStr
          ? new Date().toISOString()
          : undefined;
    const occurredAtIso = parseDateInputToIso(dateInput, preserveIso);

    if (!occurredAtIso) {
      showModalError('Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    const trimmedMerchant = merchantInput.trim();
    const trimmedNote = noteInput.trim();
    const parsedTags = parseTagsInput(tagsInput);

    const payload: CreateTransactionInput = {
      type,
      amountMinor: parsedAmountMinor,
      currency: editingTransaction?.currency ?? sourceAccount.currency ?? DEFAULT_CURRENCY,
      accountId: sourceAccount.id,
      toAccountId: type === 'TRANSFER' ? toAccountId : undefined,
      categoryId: type === 'TRANSFER' || hasSplits ? undefined : categoryId,
      incomeSourceId:
        type === 'INCOME' && incomeSourceId ? incomeSourceId : undefined,
      splits: type !== 'TRANSFER' && hasSplits ? draftSplits : undefined,
      merchant: trimmedMerchant.length > 0 ? trimmedMerchant : undefined,
      tags: parsedTags,
      note: trimmedNote.length > 0 ? trimmedNote : undefined,
      receiptUri: editingTransaction?.receiptUri,
      occurredAt: occurredAtIso,
    };

    setFormError(null);
    try {
      const formattedAmount = formatMinorUnits(payload.amountMinor, activeCurrency);
      if (editingTransaction) {
        await updateTransactionMutation.mutateAsync({
          ...payload,
          id: editingTransaction.id,
        });
        onSaved(`Transaction updated (${formattedAmount}).`);
      } else {
        await createTransactionMutation.mutateAsync(payload);
        onSaved(`Transaction added (${formattedAmount}).`);
      }
      onClose();
    } catch (error: unknown) {
      showModalError(
        getUserErrorMessage(
          error,
          'Failed to save transaction. Please try again.',
        ),
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!editingTransaction) {
      return;
    }
    setFormError(null);
    try {
      await deleteTransactionMutation.mutateAsync(editingTransaction.id);
      onDeleted('Transaction deleted and account balance restored.');
      onClose();
    } catch (error: unknown) {
      showModalError(
        getUserErrorMessage(
          error,
          'Could not delete transaction. Please try again.',
        ),
      );
    }
  };

  const primaryAccountLabel =
    type === 'INCOME'
      ? 'Destination Account'
      : type === 'TRANSFER'
        ? 'From Account'
        : 'Source Account';

  const submitLabel = isEditing ? 'Save Changes' : 'Save Transaction';

  return (
    <>
      <Modal
        visible={visible && !isSplitEditorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isBusy) onClose();
        }}
      >
        <SafeAreaView
          className="flex-1 bg-black/50"
          edges={['top', 'bottom', 'left', 'right']}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            className="flex-1 items-center justify-center p-3 sm:p-6"
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
              className="relative z-10 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
            >
              <ScrollView
                ref={modalScrollRef}
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
                    <ThemedText
                      accessibilityRole="header"
                      className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    >
                      {isEditing ? 'Edit Transaction' : 'Add Transaction'}
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Record incoming, outgoing, or transfer entries
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={onClose}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Close dialog"
                    className="min-h-[44px] px-4 py-2 rounded-xl items-center justify-center bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Close
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Type Selector */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Transaction Type
                  </ThemedText>
                  <View
                    accessibilityRole="tablist"
                    className="flex-row flex-wrap gap-2"
                  >
                    {TYPE_OPTIONS.map((opt) => {
                      const isSelected = type === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => handleSelectType(opt.key)}
                          disabled={isBusy}
                          accessibilityRole="tab"
                          accessibilityLabel={opt.label}
                          accessibilityState={{ selected: isSelected }}
                          className={`flex-1 min-w-[96px] min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-500 border-brand-500 dark:bg-brand-400 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-ledger-canvas dark:text-brand-900'
                                : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                            }`}
                          >
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Top Form Error Banner */}
                {formError ? (
                  <View
                    accessibilityRole="alert"
                    className="p-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                  >
                    <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      {formError}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Amount & Date Row */}
                <View className={isWide ? 'flex-row items-start gap-5' : 'gap-4'}>
                  {/* Amount Input */}
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Amount ({activeCurrency})
                    </ThemedText>
                    <TextInput
                      value={amountInput}
                      onChangeText={(text) => {
                        setAmountInput(normalizeDecimalInput(text));
                        if (amountError) setAmountError(null);
                        if (formError) setFormError(null);
                      }}
                      onBlur={() => {
                        setAmountTouched(true);
                        setAmountError(validateAmountText(amountInput));
                      }}
                      placeholder="0.00"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Transaction amount"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      editable={!isBusy}
                      style={TABULAR_NUMS_STYLE}
                      className={`h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border text-ledger-ink dark:text-ledger-ink-dark text-base font-bold ${
                        amountTouched && amountError
                          ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
                          : 'border-ledger-border-strong dark:border-ledger-border-strong-dark'
                      }`}
                    />
                    {amountTouched && amountError ? (
                      <ThemedText
                        accessibilityRole="alert"
                        className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                      >
                        {amountError}
                      </ThemedText>
                    ) : null}
                  </View>

                  {/* Date Input (Plain YYYY-MM-DD, no presets) */}
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Date (YYYY-MM-DD)
                    </ThemedText>
                    <TextInput
                      value={dateInput}
                      onChangeText={(text) => {
                        setDateInput(text);
                        if (dateError) setDateError(null);
                        if (formError) setFormError(null);
                      }}
                      onBlur={() => {
                        setDateTouched(true);
                        setDateError(validateDateText(dateInput));
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Transaction date in YYYY-MM-DD format"
                      keyboardType="numbers-and-punctuation"
                      autoCorrect={false}
                      spellCheck={false}
                      editable={!isBusy}
                      style={TABULAR_NUMS_STYLE}
                      className={`h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border text-ledger-ink dark:text-ledger-ink-dark text-sm font-medium ${
                        dateTouched && dateError
                          ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
                          : 'border-ledger-border-strong dark:border-ledger-border-strong-dark'
                      }`}
                    />
                    {dateTouched && dateError ? (
                      <ThemedText
                        accessibilityRole="alert"
                        className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                      >
                        {dateError}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>

                {/* Primary Account Selector */}
                <HorizontalAccountCardPicker
                  label={primaryAccountLabel}
                  accounts={accounts}
                  selectedAccountId={accountId}
                  disabled={isBusy}
                  onSelect={(nextAccountId) => {
                    setAccountId(nextAccountId);
                    if (type === 'TRANSFER' && toAccountId === nextAccountId) {
                      const alt =
                        accounts.find((a) => a.id !== nextAccountId)?.id ?? '';
                      setToAccountId(alt);
                    }
                    if (formError) setFormError(null);
                  }}
                />

                {/* Destination Account Selector (Transfer only) */}
                {type === 'TRANSFER' && (
                  <HorizontalAccountCardPicker
                    label="To Account"
                    accounts={accounts}
                    selectedAccountId={toAccountId}
                    disabledAccountId={accountId}
                    disabled={isBusy}
                    onSelect={(nextToAccountId) => {
                      setToAccountId(nextToAccountId);
                      if (formError) setFormError(null);
                    }}
                  />
                )}

                {/* Category & Splits Section (Incoming / Outgoing only) */}
                {type !== 'TRANSFER' && (
                  <View className="gap-2">
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        Category
                      </ThemedText>

                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => {
                            setShowCustomCategoryForm((prev) => !prev);
                            setCustomCategoryError(null);
                          }}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={
                            showCustomCategoryForm
                              ? 'Close new category form'
                              : 'Create new category'
                          }
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                            {showCustomCategoryForm ? 'Close' : '+ New Category'}
                          </ThemedText>
                        </Pressable>

                        <Pressable
                          onPress={handleOpenSplitEditor}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={
                            hasSplits
                              ? `Edit split categories (${draftSplits.length})`
                              : 'Split across categories'
                          }
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                            {hasSplits
                              ? `Edit Splits (${draftSplits.length})`
                              : 'Split Categories'}
                          </ThemedText>
                        </Pressable>
                      </View>
                    </View>

                    {/* Compact Inline New Category Creator */}
                    {showCustomCategoryForm && (
                      <View className="p-3.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2.5">
                        <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          New {type === 'INCOME' ? 'Incoming' : 'Outgoing'} Category
                        </ThemedText>

                        <TextInput
                          value={customCategoryName}
                          onChangeText={(text) => {
                            setCustomCategoryName(text);
                            if (customCategoryError) setCustomCategoryError(null);
                          }}
                          placeholder="Category name (e.g. Education, Side Gig)"
                          placeholderTextColor={theme.textMuted}
                          accessibilityLabel="New category name"
                          editable={!isBusy}
                          maxLength={40}
                          className="h-12 px-3.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                        />

                        {customCategoryError ? (
                          <ThemedText
                            accessibilityRole="alert"
                            className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                          >
                            {customCategoryError}
                          </ThemedText>
                        ) : null}

                        <View className="gap-1.5">
                          <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                            Color Swatch
                          </ThemedText>
                          <View className="flex-row flex-wrap gap-2">
                            {CATEGORY_SWATCH_PALETTE.map((swatch) => {
                              const isSelected = customCategoryColor === swatch.color;
                              return (
                                <Pressable
                                  key={swatch.color}
                                  onPress={() => setCustomCategoryColor(swatch.color)}
                                  disabled={isBusy}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Select swatch color ${swatch.label}`}
                                  accessibilityState={{ selected: isSelected }}
                                  className={`min-w-[44px] min-h-[44px] rounded-xl items-center justify-center border-2 ${
                                    isSelected
                                      ? 'border-ledger-ink dark:border-ledger-ink-dark'
                                      : 'border-transparent'
                                  }`}
                                  style={{ backgroundColor: swatch.color }}
                                >
                                  {isSelected ? (
                                    <View className="w-2.5 h-2.5 rounded-full bg-ledger-canvas" />
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>

                        <Pressable
                          onPress={handleCreateCustomCategory}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Save new category"
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center"
                        >
                          {createCategoryMutation.isPending ? (
                            <ActivityIndicator size="small" color={theme.onPrimary} />
                          ) : (
                            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                              Create Category
                            </ThemedText>
                          )}
                        </Pressable>
                      </View>
                    )}

                    {/* Active Splits Summary OR Single Category Pills */}
                    {hasSplits ? (
                      <View className="p-3.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-2.5">
                        <View className="flex-row flex-wrap gap-1.5">
                          {draftSplits.map((split) => {
                            const cat = filteredCategories.find(
                              (c) => c.id === split.categoryId,
                            );
                            return (
                              <View
                                key={split.id}
                                className="px-2.5 py-1.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark"
                              >
                                <ThemedText
                                  numeric
                                  className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
                                >
                                  {cat?.name ?? 'Category'}:{' '}
                                  {formatMinorUnits(split.amountMinor, activeCurrency)}
                                </ThemedText>
                              </View>
                            );
                          })}
                        </View>

                        {splitRemainderMinor !== 0 ? (
                          <ThemedText
                            accessibilityRole="alert"
                            numeric
                            className="text-xs font-semibold text-ledger-ochre dark:text-ledger-ochre-dark"
                          >
                            Split differs from amount by{' '}
                            {formatMinorUnits(
                              Math.abs(splitRemainderMinor),
                              activeCurrency,
                            )}
                          </ThemedText>
                        ) : null}

                        <View className="flex-row gap-2">
                          <Pressable
                            onPress={() => setDraftSplits([])}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel="Clear split categories"
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                          >
                            <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                              Clear Splits
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View className="flex-row flex-wrap gap-2">
                        {filteredCategories.map((cat) => {
                          const isSelected = categoryId === cat.id;
                          return (
                            <Pressable
                              key={cat.id}
                              onPress={() => {
                                setCategoryId(cat.id);
                                if (formError) setFormError(null);
                              }}
                              disabled={isBusy}
                              accessibilityRole="button"
                              accessibilityLabel={`Select category ${cat.name}`}
                              accessibilityState={{ selected: isSelected }}
                              className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                                isSelected
                                  ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                                  : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                              }`}
                            >
                              <ThemedText
                                className={`text-xs font-semibold ${
                                  isSelected
                                    ? 'text-brand-500 dark:text-brand-400'
                                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
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
                )}

                {/* Optional Income Source Selector (Incoming only) */}
                {type === 'INCOME' && incomeSources.length > 0 && (
                  <View className="gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Income Source / Job (Optional)
                    </ThemedText>
                    <View className="flex-row flex-wrap gap-2">
                      <Pressable
                        onPress={() => setIncomeSourceId('')}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel="No specific job or income source"
                        accessibilityState={{ selected: incomeSourceId === '' }}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border items-center justify-center ${
                          incomeSourceId === ''
                            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                            : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                        }`}
                      >
                        <ThemedText
                          className={`text-xs font-semibold ${
                            incomeSourceId === ''
                              ? 'text-brand-500 dark:text-brand-400'
                              : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                          }`}
                        >
                          None
                        </ThemedText>
                      </Pressable>

                      {incomeSources.map((src) => {
                        const isSelected = incomeSourceId === src.id;
                        return (
                          <Pressable
                            key={src.id}
                            onPress={() => {
                              setIncomeSourceId(src.id);
                              if (merchantInput.trim().length === 0) {
                                setMerchantInput(src.name);
                              }
                            }}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Attribute income to ${src.name}`}
                            accessibilityState={{ selected: isSelected }}
                            className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex-row items-center gap-2 ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                            }`}
                          >
                            <View
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: src.color }}
                            />
                            <ThemedText
                              className={`text-xs font-semibold ${
                                isSelected
                                  ? 'text-brand-500 dark:text-brand-400'
                                  : 'text-ledger-ink dark:text-ledger-ink-dark'
                              }`}
                            >
                              {src.name}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Optional Metadata: Merchant & Tags */}
                <View className={isWide ? 'flex-row items-start gap-5' : 'gap-4'}>
                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Merchant / Counterparty (Optional)
                    </ThemedText>
                    <TextInput
                      value={merchantInput}
                      onChangeText={setMerchantInput}
                      placeholder="e.g. Whole Foods, Acme Payroll"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Merchant or counterparty"
                      editable={!isBusy}
                      maxLength={80}
                      className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                    />
                  </View>

                  <View className={isWide ? 'flex-1 min-w-0 gap-1.5' : 'gap-1.5'}>
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Tags (comma-separated)
                    </ThemedText>
                    <TextInput
                      value={tagsInput}
                      onChangeText={setTagsInput}
                      placeholder="e.g. work, shared, reimbursable"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Tags separated by commas"
                      editable={!isBusy}
                      autoCapitalize="none"
                      className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                    />
                  </View>
                </View>

                {/* Note Multiline Input */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Note (Optional)
                  </ThemedText>
                  <TextInput
                    value={noteInput}
                    onChangeText={setNoteInput}
                    placeholder="Add details or memo..."
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Transaction note"
                    editable={!isBusy}
                    multiline
                    numberOfLines={3}
                    maxLength={280}
                    textAlignVertical="top"
                    className="min-h-[84px] p-3.5 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                  />
                </View>

                {/* Footer Actions */}
                <View
                  className={
                    isWide
                      ? 'flex-row-reverse items-center justify-between gap-3 pt-3 border-t border-ledger-border dark:border-ledger-border-dark'
                      : 'gap-2.5 pt-3 border-t border-ledger-border dark:border-ledger-border-dark'
                  }
                >
                  <Pressable
                    onPress={handleSubmit}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={submitLabel}
                    className={`min-h-[44px] py-3 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center ${
                      isWide ? 'min-w-[200px] px-6' : 'w-full'
                    } ${isBusy ? 'opacity-70' : ''}`}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <ThemedText className="text-sm font-bold text-ledger-canvas dark:text-brand-900">
                        {submitLabel}
                      </ThemedText>
                    )}
                  </Pressable>

                  <View className="flex-row items-center gap-2.5">
                    {isEditing && confirmingDelete ? (
                      <>
                        <Pressable
                          onPress={() => setConfirmingDelete(false)}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel delete transaction"
                          className={`${
                            isWide ? 'px-4' : 'flex-1'
                          } min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75`}
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>

                        <Pressable
                          onPress={handleConfirmDelete}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Confirm delete transaction"
                          className={`${
                            isWide ? 'px-4' : 'flex-1'
                          } min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85`}
                        >
                          {deleteTransactionMutation.isPending ? (
                            <ActivityIndicator size="small" color={theme.onPrimary} />
                          ) : (
                            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
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
                          className={`${
                            isWide ? 'px-5' : 'flex-1'
                          } min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75`}
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>

                        {isEditing ? (
                          <Pressable
                            onPress={() => setConfirmingDelete(true)}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel="Delete transaction"
                            className={`${
                              isWide ? 'px-4' : 'flex-1'
                            } min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75`}
                          >
                            <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                              Delete Transaction
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
        </SafeAreaView>
      </Modal>

      <SplitEditorModal
        visible={visible && isSplitEditorOpen}
        totalAmountMinor={parsedAmountMinor !== null && parsedAmountMinor > 0 ? parsedAmountMinor : 0}
        currency={activeCurrency}
        categories={filteredCategories}
        initialCategoryId={categoryId || filteredCategories[0]?.id}
        initialSplits={draftSplits.length >= 2 ? draftSplits : undefined}
        onClose={() => setIsSplitEditorOpen(false)}
        onApplySplits={(nextSplits, updatedTotalMinor) => {
          setDraftSplits(nextSplits);
          if (typeof updatedTotalMinor === 'number' && updatedTotalMinor > 0) {
            setAmountInput(minorUnitsToDecimalInput(updatedTotalMinor));
            setAmountError(null);
          }
          setFormError(null);
          setIsSplitEditorOpen(false);
        }}
        onClearSplits={() => {
          setDraftSplits([]);
          setIsSplitEditorOpen(false);
        }}
      />
    </>
  );
}
