import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  getAccountTypeLabel,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  PAY_SCHEDULE_LABELS,
  type Account,
  type Category,
  type IncomeSource,
  type IncomeSourceInput,
  type PaySchedule,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { Colors, TABULAR_NUMS_STYLE } from '@/common/constants/theme';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';

export interface IncomeSourceModalProps {
  visible: boolean;
  editingSource: IncomeSource | null;
  accounts: readonly Account[];
  incomeCategories: readonly Category[];
  isSubmitting: boolean;
  onClose: () => void;
  onSave: (input: Omit<IncomeSourceInput, 'id'> & { id?: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

const SCHEDULE_OPTIONS: readonly { key: PaySchedule; label: string }[] = [
  { key: 'SEMI_MONTHLY', label: PAY_SCHEDULE_LABELS.SEMI_MONTHLY },
  { key: 'MONTHLY', label: PAY_SCHEDULE_LABELS.MONTHLY },
  { key: 'BIWEEKLY', label: PAY_SCHEDULE_LABELS.BIWEEKLY },
  { key: 'WEEKLY', label: PAY_SCHEDULE_LABELS.WEEKLY },
  { key: 'VARIABLE', label: 'Variable' },
];

const JOB_COLOR_SWATCHES: readonly { label: string; color: string }[] = [
  { label: 'Forest Pine', color: Colors.light.primary },
  { label: 'Sage Pine', color: Colors.light.positive },
  { label: 'Deep Teal', color: Colors.light.info },
  { label: 'Warm Ochre', color: Colors.light.warning },
  { label: 'Terracotta', color: Colors.light.negative },
  { label: 'Warm Slate', color: Colors.light.textSecondary },
];

export function IncomeSourceModal({
  visible,
  editingSource,
  accounts,
  incomeCategories,
  isSubmitting,
  onClose,
  onSave,
  onDelete,
}: IncomeSourceModalProps) {
  const theme = useTheme();

  const [nameInput, setNameInput] = useState('');
  const [paySchedule, setPaySchedule] = useState<PaySchedule>('SEMI_MONTHLY');
  const [payDaysLabel, setPayDaysLabel] = useState('');
  const [expectedMonthlyInput, setExpectedMonthlyInput] = useState('');
  const [typicalPayoutInput, setTypicalPayoutInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('cat-salary');
  const [selectedColor, setSelectedColor] = useState<string>(JOB_COLOR_SWATCHES[0].color);
  const [isActive, setIsActive] = useState(true);
  const [notesInput, setNotesInput] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const defaultAccount = accounts[0]?.id ?? '';
    const defaultCategory =
      incomeCategories.find((c) => c.id === 'cat-salary')?.id ??
      incomeCategories[0]?.id ??
      'cat-salary';

    if (editingSource) {
      setNameInput(editingSource.name);
      setPaySchedule(editingSource.paySchedule);
      setPayDaysLabel(editingSource.payDaysLabel ?? '');
      setExpectedMonthlyInput(
        minorUnitsToDecimalInput(editingSource.expectedMonthlyMinor),
      );
      setTypicalPayoutInput(
        typeof editingSource.typicalPayoutMinor === 'number'
          ? minorUnitsToDecimalInput(editingSource.typicalPayoutMinor)
          : '',
      );
      setAccountId(editingSource.accountId);
      setCategoryId(editingSource.categoryId);
      setSelectedColor(editingSource.color);
      setIsActive(editingSource.isActive);
      setNotesInput(editingSource.notes ?? '');
    } else {
      setNameInput('');
      setPaySchedule('SEMI_MONTHLY');
      setPayDaysLabel('');
      setExpectedMonthlyInput('');
      setTypicalPayoutInput('');
      setAccountId(defaultAccount);
      setCategoryId(defaultCategory);
      setSelectedColor(JOB_COLOR_SWATCHES[0].color);
      setIsActive(true);
      setNotesInput('');
    }
    setConfirmingDelete(false);
    setFormError(null);
  }, [visible, editingSource, accounts, incomeCategories]);

  const handleSave = async () => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setFormError('Please enter a job or income source name.');
      return;
    }

    const expectedMinor =
      expectedMonthlyInput.trim().length === 0
        ? 0
        : parseDecimalToMinorUnits(expectedMonthlyInput);
    if (expectedMinor === null || expectedMinor < 0) {
      setFormError('Enter a valid non-negative expected monthly amount.');
      return;
    }

    let typicalMinor: number | undefined;
    if (typicalPayoutInput.trim().length > 0) {
      const parsedTypical = parseDecimalToMinorUnits(typicalPayoutInput);
      if (parsedTypical === null || parsedTypical < 0) {
        setFormError('Enter a valid non-negative typical payout amount.');
        return;
      }
      typicalMinor = parsedTypical;
    }

    const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
    if (!selectedAccount) {
      setFormError('Please select a deposit account.');
      return;
    }

    setFormError(null);
    try {
      await onSave({
        ...(editingSource ? { id: editingSource.id } : {}),
        name: trimmedName,
        expectedMonthlyMinor: expectedMinor,
        ...(typicalMinor !== undefined ? { typicalPayoutMinor: typicalMinor } : {}),
        currency: selectedAccount.currency ?? DEFAULT_CURRENCY,
        accountId: selectedAccount.id,
        categoryId: categoryId || 'cat-salary',
        paySchedule,
        ...(payDaysLabel.trim() ? { payDaysLabel: payDaysLabel.trim() } : {}),
        color: selectedColor,
        isActive,
        ...(notesInput.trim() ? { notes: notesInput.trim() } : {}),
      });
      onClose();
    } catch (error: unknown) {
      setFormError(getUserErrorMessage(error, 'Could not save income source.'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!editingSource) {
      return;
    }
    setFormError(null);
    try {
      await onDelete(editingSource.id);
      onClose();
    } catch (error: unknown) {
      setFormError(getUserErrorMessage(error, 'Could not delete income source.'));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <SafeAreaView
        className="flex-1 bg-black/55"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          className="flex-1 justify-center items-center p-4"
        >
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss income source dialog"
            onPress={() => {
              if (!isSubmitting) onClose();
            }}
          />

          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[480px] max-h-[92%] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-6 gap-4"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText
                  accessibilityRole="header"
                  className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {editingSource ? 'Edit Job / Source' : 'Add Job / Source'}
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Track expected monthly pay and 1-tap payday deposits
                </ThemedText>
              </View>

              <Pressable
                onPress={onClose}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {formError ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                className="p-3 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark"
              >
                <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                  {formError}
                </ThemedText>
              </View>
            ) : null}

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
                {/* Job Name */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Job / Income Name
                  </ThemedText>
                  <TextInput
                    value={nameInput}
                    onChangeText={(t) => {
                      setNameInput(t);
                      if (formError) setFormError(null);
                    }}
                    placeholder="e.g. Job 1 — Acme Corp, Part-Time Design"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Job or income source name"
                    maxLength={60}
                    editable={!isSubmitting}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-medium text-ledger-ink dark:text-ledger-ink-dark"
                  />
                </View>

                {/* Pay Schedule */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Pay Schedule
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {SCHEDULE_OPTIONS.map((opt) => {
                      const isSelected = paySchedule === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setPaySchedule(opt.key)}
                          disabled={isSubmitting}
                          accessibilityRole="button"
                          accessibilityLabel={`Select schedule ${opt.label}`}
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
                            {opt.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Expected Monthly & Typical Payout */}
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      {`Expected / Mo (${DEFAULT_CURRENCY_SYMBOL})`}
                    </ThemedText>
                    <TextInput
                      value={expectedMonthlyInput}
                      onChangeText={(t) => {
                        setExpectedMonthlyInput(normalizeDecimalInput(t));
                        if (formError) setFormError(null);
                      }}
                      placeholder="0.00"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Expected monthly income amount"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      style={TABULAR_NUMS_STYLE}
                      editable={!isSubmitting}
                      className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    />
                  </View>

                  <View className="flex-1 gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      {`Typical Payout (${DEFAULT_CURRENCY_SYMBOL})`}
                    </ThemedText>
                    <TextInput
                      value={typicalPayoutInput}
                      onChangeText={(t) => {
                        setTypicalPayoutInput(normalizeDecimalInput(t));
                        if (formError) setFormError(null);
                      }}
                      placeholder="Optional"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="Typical payout per payday"
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      style={TABULAR_NUMS_STYLE}
                      editable={!isSubmitting}
                      className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    />
                  </View>
                </View>

                {/* Pay Days Hint */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Pay Days Hint (Optional)
                  </ThemedText>
                  <TextInput
                    value={payDaysLabel}
                    onChangeText={setPayDaysLabel}
                    placeholder="e.g. 15th & 30th, Every Friday, Variable"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Pay days hint"
                    maxLength={40}
                    editable={!isSubmitting}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm text-ledger-ink dark:text-ledger-ink-dark"
                  />
                </View>

                {/* Deposit Account */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Default Deposit Account
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {accounts.map((acc) => {
                      const isSelected = accountId === acc.id;
                      return (
                        <Pressable
                          key={acc.id}
                          onPress={() => setAccountId(acc.id)}
                          disabled={isSubmitting}
                          accessibilityRole="button"
                          accessibilityLabel={`Deposit into ${acc.name}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl border justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <ThemedText
                            numeric
                            className={`text-xs font-semibold ${
                              isSelected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink dark:text-ledger-ink-dark'
                            }`}
                          >
                            {`${acc.name} · ${getAccountTypeLabel(acc.accountType)} (${formatMinorUnits(
                              acc.balanceMinor,
                              acc.currency,
                            )})`}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Income Category */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Income Category
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {incomeCategories.map((cat) => {
                      const isSelected = categoryId === cat.id;
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => setCategoryId(cat.id)}
                          disabled={isSubmitting}
                          accessibilityRole="button"
                          accessibilityLabel={`Select category ${cat.name}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border items-center justify-center ${
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

                {/* Color Swatch */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Badge Color
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {JOB_COLOR_SWATCHES.map((swatch) => {
                      const isSelected = selectedColor === swatch.color;
                      return (
                        <Pressable
                          key={swatch.color}
                          onPress={() => setSelectedColor(swatch.color)}
                          disabled={isSubmitting}
                          accessibilityRole="button"
                          accessibilityLabel={`Select color ${swatch.label}`}
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

                {/* Active Switch (when editing) */}
                {editingSource && (
                  <View className="p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Include in Expected Pay
                      </ThemedText>
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                        Disable if this job is paused or seasonal
                      </ThemedText>
                    </View>
                    <Switch
                      value={isActive}
                      onValueChange={setIsActive}
                      disabled={isSubmitting}
                      accessibilityLabel="Include job in expected monthly pay"
                      trackColor={{ false: theme.borderStrong, true: theme.primary }}
                      thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                    />
                  </View>
                )}

                {/* Notes */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Notes (Optional)
                  </ThemedText>
                  <TextInput
                    value={notesInput}
                    onChangeText={setNotesInput}
                    placeholder="e.g. Net take-home after tax"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Income source notes"
                    maxLength={280}
                    editable={!isSubmitting}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm text-ledger-ink dark:text-ledger-ink-dark"
                  />
                </View>
              </View>
            </ScrollView>

            {/* Footer Actions */}
            <View className="gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
              <Pressable
                onPress={handleSave}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={editingSource ? 'Save Job Changes' : 'Add Job'}
                className={`min-h-[44px] py-3 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-85 ${
                  isSubmitting ? 'opacity-60' : ''
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <ThemedText className="text-sm font-bold text-ledger-canvas dark:text-brand-900">
                    {editingSource ? 'Save Changes' : 'Save Job / Source'}
                  </ThemedText>
                )}
              </Pressable>

              {editingSource && !confirmingDelete && (
                <Pressable
                  onPress={() => setConfirmingDelete(true)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Delete job or income source"
                  className="min-h-[44px] py-2.5 rounded-xl items-center justify-center border border-ledger-border dark:border-ledger-border-dark bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    Remove Job / Source
                  </ThemedText>
                </Pressable>
              )}

              {editingSource && confirmingDelete && (
                <View className="p-3.5 rounded-2xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft gap-3">
                  <ThemedText className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                    Remove &quot;{editingSource.name}&quot;? Past payday transactions will stay in your history.
                  </ThemedText>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setConfirmingDelete(false)}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel removal"
                      className="flex-1 min-h-[44px] rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                    >
                      <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                        Cancel
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmDelete}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm remove job"
                      className="flex-1 min-h-[44px] rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                        Remove
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
