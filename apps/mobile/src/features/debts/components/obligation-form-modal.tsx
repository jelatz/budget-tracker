import React, { useEffect, useState } from 'react';
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
  DEFAULT_CURRENCY,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type Account,
  type Category,
  type CommitmentKind,
  type RecurringCommitment,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import { useUpsertRecurringCommitment } from '@/features/transactions/hooks/use-transactions';

export interface ObligationFormModalProps {
  visible: boolean;
  editingCommitment: RecurringCommitment | null;
  initialKind?: CommitmentKind;
  initialAccountId?: string;
  accounts: readonly Account[];
  categories: readonly Category[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

const KIND_TABS: readonly { key: CommitmentKind; label: string; hint: string }[] = [
  {
    key: 'CREDIT_CARD_INSTALLMENT',
    label: 'Card Installment',
    hint: 'Monthly 0% or fixed-term card installment added to your card bill',
  },
  {
    key: 'LOAN',
    label: 'Loan',
    hint: 'Fixed monthly loan payment with total term tracking',
  },
  {
    key: 'BILL',
    label: 'Home & Utilities',
    hint: 'Electricity, water, internet, rent, or recurring household bill',
  },
];

export function ObligationFormModal({
  visible,
  editingCommitment,
  initialKind = 'CREDIT_CARD_INSTALLMENT',
  initialAccountId,
  accounts,
  categories,
  onClose,
  onSaved,
}: ObligationFormModalProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const modalWidth = Math.min(Math.max(windowWidth - 28, 280), 640);

  const upsertMutation = useUpsertRecurringCommitment();

  const creditCardAccounts = accounts.filter((a) => a.accountType === 'CREDIT_CARD');
  const liquidAccounts = accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');

  const [kind, setKind] = useState<CommitmentKind>(initialKind);
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDayInput, setDueDayInput] = useState('15');
  const [totalTermsInput, setTotalTermsInput] = useState('12');
  const [paidTermsInput, setPaidTermsInput] = useState('0');
  const [isAutoPaid, setIsAutoPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (editingCommitment) {
      const k = editingCommitment.kind;
      setKind(k);
      setName(editingCommitment.name);
      setAmountInput(minorUnitsToDecimalInput(editingCommitment.amountMinor));
      setAccountId(editingCommitment.accountId);
      setCategoryId(editingCommitment.categoryId);
      setDueDayInput(String(editingCommitment.dueDay));
      setTotalTermsInput(
        editingCommitment.totalInstallments !== undefined
          ? String(editingCommitment.totalInstallments)
          : '12',
      );
      setPaidTermsInput(String(editingCommitment.paidInstallments));
      setIsAutoPaid(editingCommitment.isAutoPaid);
      setNotes(editingCommitment.notes ?? '');
    } else {
      const nextKind =
        initialKind === 'CREDIT_CARD_INSTALLMENT' && creditCardAccounts.length === 0
          ? 'BILL'
          : initialKind;
      setKind(nextKind);
      setName('');
      setAmountInput('');
      if (nextKind === 'CREDIT_CARD_INSTALLMENT') {
        setAccountId(
          initialAccountId && creditCardAccounts.some((a) => a.id === initialAccountId)
            ? initialAccountId
            : (creditCardAccounts[0]?.id ?? accounts[0]?.id ?? ''),
        );
      } else {
        setAccountId(
          initialAccountId && liquidAccounts.some((a) => a.id === initialAccountId)
            ? initialAccountId
            : (liquidAccounts[0]?.id ?? accounts[0]?.id ?? ''),
        );
      }
      const defaultCat =
        expenseCategories.find((c) => c.id === 'cat-bills')?.id ??
        expenseCategories[0]?.id ??
        'cat-bills';
      setCategoryId(defaultCat);
      setDueDayInput('15');
      setTotalTermsInput('12');
      setPaidTermsInput('0');
      setIsAutoPaid(false);
      setNotes('');
    }
    setFormError(null);
  }, [visible, editingCommitment, initialKind, initialAccountId, accounts, categories]);

  const handleSelectKind = (nextKind: CommitmentKind) => {
    setKind(nextKind);
    setFormError(null);
    if (nextKind === 'CREDIT_CARD_INSTALLMENT') {
      if (!creditCardAccounts.some((a) => a.id === accountId)) {
        setAccountId(creditCardAccounts[0]?.id ?? accounts[0]?.id ?? '');
      }
    } else if (!liquidAccounts.some((a) => a.id === accountId) && liquidAccounts.length > 0) {
      setAccountId(liquidAccounts[0].id);
    }
  };

  const selectableAccounts =
    kind === 'CREDIT_CARD_INSTALLMENT' ? creditCardAccounts : accounts;
  const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a name (e.g. Meralco, iPhone Installment, Car Loan).');
      return;
    }

    const amountMinor = parseDecimalToMinorUnits(amountInput);
    if (amountMinor === null || amountMinor <= 0) {
      setFormError('Please enter a monthly amount greater than 0.');
      return;
    }

    if (kind === 'CREDIT_CARD_INSTALLMENT' && creditCardAccounts.length === 0) {
      setFormError('Add a Credit Card account in the Accounts tab first.');
      return;
    }

    if (!accountId || !selectedAccount) {
      setFormError('Please select an account.');
      return;
    }

    const parsedDueDay = Number.parseInt(dueDayInput.trim(), 10);
    if (!Number.isInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
      setFormError('Due day must be a whole number from 1 to 31.');
      return;
    }

    let totalInstallments: number | undefined;
    let paidInstallments = 0;

    if (kind === 'CREDIT_CARD_INSTALLMENT' || kind === 'LOAN') {
      const parsedTotal = Number.parseInt(totalTermsInput.trim(), 10);
      const parsedPaid = Number.parseInt(paidTermsInput.trim() || '0', 10);
      if (!Number.isInteger(parsedTotal) || parsedTotal <= 0) {
        setFormError('Total months must be at least 1.');
        return;
      }
      if (!Number.isInteger(parsedPaid) || parsedPaid < 0 || parsedPaid > parsedTotal) {
        setFormError('Months already paid must be between 0 and total months.');
        return;
      }
      totalInstallments = parsedTotal;
      paidInstallments = parsedPaid;
    }

    setFormError(null);
    try {
      await upsertMutation.mutateAsync({
        ...(editingCommitment ? { id: editingCommitment.id } : {}),
        name: trimmedName,
        kind,
        amountMinor,
        currency: selectedAccount.currency ?? DEFAULT_CURRENCY,
        accountId: selectedAccount.id,
        categoryId: categoryId || expenseCategories[0]?.id || 'cat-bills',
        frequency: 'MONTHLY',
        dueDay: parsedDueDay,
        isAutoPaid,
        isActive: editingCommitment?.isActive ?? true,
        ...(totalInstallments !== undefined ? { totalInstallments } : {}),
        paidInstallments,
        ...(editingCommitment?.dueLabel ? { dueLabel: editingCommitment.dueLabel } : {}),
        ...(editingCommitment?.nextDueDate
          ? { nextDueDate: editingCommitment.nextDueDate }
          : {}),
        ...(editingCommitment?.previousNextDueDate
          ? { previousNextDueDate: editingCommitment.previousNextDueDate }
          : {}),
        ...(editingCommitment?.lastPaidPeriod
          ? { lastPaidPeriod: editingCommitment.lastPaidPeriod }
          : {}),
        ...(editingCommitment?.previousLastPaidPeriod
          ? { previousLastPaidPeriod: editingCommitment.previousLastPaidPeriod }
          : {}),
        ...(editingCommitment?.lastPaidCycles !== undefined
          ? { lastPaidCycles: editingCommitment.lastPaidCycles }
          : {}),
        ...(editingCommitment?.lastPaidTransactionId
          ? { lastPaidTransactionId: editingCommitment.lastPaidTransactionId }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onSaved(editingCommitment ? `${trimmedName} updated.` : `${trimmedName} added.`);
      onClose();
    } catch (error: unknown) {
      setFormError(
        getUserErrorMessage(error, 'Could not save obligation. Please try again.'),
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!upsertMutation.isPending) onClose();
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
              if (!upsertMutation.isPending) onClose();
            }}
            disabled={upsertMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            className="absolute inset-0"
          />

          <View
            style={{ width: modalWidth, maxHeight: '92%' }}
            className="relative z-10 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden"
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: isWide ? 24 : 20,
                gap: 16,
              }}
            >
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <ThemedText
                    accessibilityRole="header"
                    className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  >
                    {editingCommitment ? 'Edit Obligation' : 'Add Debt or Bill'}
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {KIND_TABS.find((t) => t.key === kind)?.hint}
                  </ThemedText>
                </View>

                <Pressable
                  onPress={onClose}
                  disabled={upsertMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <AppIcon name="close" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>

              {/* 3-Mode Type Switcher */}
              <View className="flex-row flex-wrap gap-2">
                {KIND_TABS.map((tab) => {
                  const isSelected = kind === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => handleSelectKind(tab.key)}
                      disabled={upsertMutation.isPending}
                      accessibilityRole="tab"
                      accessibilityLabel={tab.label}
                      accessibilityState={{ selected: isSelected }}
                      className={`flex-1 min-w-[110px] min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
                        isSelected
                          ? 'bg-brand-500 border-brand-500 dark:bg-brand-400 dark:border-brand-400'
                          : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                      }`}
                    >
                      <ThemedText
                        numberOfLines={1}
                        className={`text-xs font-bold ${
                          isSelected
                            ? 'text-ledger-canvas dark:text-brand-900'
                            : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                        }`}
                      >
                        {tab.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {formError ? (
                <View
                  accessibilityRole="alert"
                  className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
                >
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    {formError}
                  </ThemedText>
                </View>
              ) : null}

              {/* Name */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Name
                </ThemedText>
                <TextInput
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (formError) setFormError(null);
                  }}
                  placeholder={
                    kind === 'CREDIT_CARD_INSTALLMENT'
                      ? 'e.g. Phone 12-mo 0%'
                      : kind === 'LOAN'
                        ? 'e.g. SSS Loan, Auto Loan'
                        : 'e.g. Meralco, Rent, Internet'
                  }
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel="Obligation name"
                  editable={!upsertMutation.isPending}
                  maxLength={60}
                  className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm font-medium"
                />
              </View>

              {/* Amount & Due Day */}
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {kind === 'BILL'
                      ? 'Estimated Monthly (PHP)'
                      : 'Monthly Payment (PHP)'}
                  </ThemedText>
                  <TextInput
                    value={amountInput}
                    onChangeText={(text) => {
                      setAmountInput(normalizeDecimalInput(text));
                      if (formError) setFormError(null);
                    }}
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Monthly payment amount"
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    editable={!upsertMutation.isPending}
                    style={TABULAR_NUMS_STYLE}
                    className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-base font-bold"
                  />
                </View>

                <View className="w-28 gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Due Day
                  </ThemedText>
                  <TextInput
                    value={dueDayInput}
                    onChangeText={(text) => {
                      setDueDayInput(text.replace(/[^0-9]/g, ''));
                      if (formError) setFormError(null);
                    }}
                    placeholder="15"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Monthly due day (1 to 31)"
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!upsertMutation.isPending}
                    style={TABULAR_NUMS_STYLE}
                    className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-base font-bold text-center"
                  />
                </View>
              </View>

              {/* Installment / Loan Term Progress */}
              {(kind === 'CREDIT_CARD_INSTALLMENT' || kind === 'LOAN') && (
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Total Months
                    </ThemedText>
                    <TextInput
                      value={totalTermsInput}
                      onChangeText={(text) =>
                        setTotalTermsInput(text.replace(/[^0-9]/g, ''))
                      }
                      placeholder="12"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Total months"
                      keyboardType="number-pad"
                      maxLength={3}
                      editable={!upsertMutation.isPending}
                      style={TABULAR_NUMS_STYLE}
                      className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm font-bold"
                    />
                  </View>

                  <View className="flex-1 gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Already Paid
                    </ThemedText>
                    <TextInput
                      value={paidTermsInput}
                      onChangeText={(text) =>
                        setPaidTermsInput(text.replace(/[^0-9]/g, ''))
                      }
                      placeholder="0"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Months already paid"
                      keyboardType="number-pad"
                      maxLength={3}
                      editable={!upsertMutation.isPending}
                      style={TABULAR_NUMS_STYLE}
                      className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm font-bold"
                    />
                  </View>
                </View>
              )}

              {/* Account Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  {kind === 'CREDIT_CARD_INSTALLMENT'
                    ? 'Credit Card Account'
                    : 'Default Payment Account'}
                </ThemedText>
                {selectableAccounts.length === 0 ? (
                  <View className="p-3 rounded-xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark">
                    <ThemedText className="text-xs font-semibold text-ledger-ochre dark:text-ledger-ochre-dark">
                      No Credit Card account found yet. Add one in the Accounts tab
                      first.
                    </ThemedText>
                  </View>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {selectableAccounts.map((acc) => {
                      const isSelected = accountId === acc.id;
                      return (
                        <Pressable
                          key={acc.id}
                          onPress={() => setAccountId(acc.id)}
                          disabled={upsertMutation.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={`Select account ${acc.name}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl border justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {acc.name}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Category Selector */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Category
                </ThemedText>
                <View className="flex-row flex-wrap gap-2">
                  {expenseCategories.slice(0, 8).map((cat) => {
                    const isSelected = categoryId === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setCategoryId(cat.id)}
                        disabled={upsertMutation.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`Select category ${cat.name}`}
                        accessibilityState={{ selected: isSelected }}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border justify-center ${
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
              </View>

              {/* Auto-Pay Toggle for Bills / Loans */}
              {kind !== 'CREDIT_CARD_INSTALLMENT' && (
                <Pressable
                  onPress={() => setIsAutoPaid((prev) => !prev)}
                  disabled={upsertMutation.isPending}
                  accessibilityRole="switch"
                  accessibilityLabel="Auto-paid monthly"
                  accessibilityState={{ checked: isAutoPaid }}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between"
                >
                  <View className="flex-1 pr-3">
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Auto-debited monthly
                    </ThemedText>
                    <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Visual reminder badge for automatic deductions
                    </ThemedText>
                  </View>
                  <View
                    className={`w-11 h-6 rounded-full p-0.5 justify-center ${
                      isAutoPaid
                        ? 'bg-brand-500 dark:bg-brand-400 items-end'
                        : 'bg-ledger-border-strong dark:bg-ledger-border-strong-dark items-start'
                    }`}
                  >
                    <View className="w-5 h-5 rounded-full bg-ledger-surface" />
                  </View>
                </Pressable>
              )}

              {/* Optional Note */}
              <View className="gap-1.5">
                <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Notes (Optional)
                </ThemedText>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Account number or reminder..."
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel="Obligation notes"
                  editable={!upsertMutation.isPending}
                  maxLength={280}
                  className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-sm"
                />
              </View>

              {/* Footer */}
              <View className="flex-row gap-2.5 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
                <Pressable
                  onPress={onClose}
                  disabled={upsertMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                    Cancel
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={handleSubmit}
                  disabled={upsertMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Save Obligation"
                  className={`flex-1 min-h-[44px] py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center ${
                    upsertMutation.isPending ? 'opacity-70' : ''
                  }`}
                >
                  {upsertMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.onPrimary} />
                  ) : (
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                      {editingCommitment ? 'Save Changes' : 'Save Obligation'}
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
