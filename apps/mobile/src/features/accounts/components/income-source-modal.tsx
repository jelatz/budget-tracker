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
  formatCalendarDateString,
  formatMinorUnits,
  getAccountTypeLabel,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDateInputToIso,
  parseDecimalToMinorUnits,
  type Account,
  type Category,
  type IncomeSource,
  type IncomeSourceInput,
  type PaySchedule,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
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

interface SchedulePresetOption {
  id: string;
  label: string;
  schedule: PaySchedule;
}

const SCHEDULE_OPTIONS: readonly SchedulePresetOption[] = [
  { id: '15_30', label: '15th & 30th', schedule: 'SEMI_MONTHLY' },
  { id: '2_4_FRI', label: '2nd & 4th Friday', schedule: 'TWICE_MONTHLY_WEEKDAY' },
  { id: 'MONTHLY', label: 'Monthly', schedule: 'MONTHLY' },
  { id: 'BIWEEKLY', label: 'Biweekly', schedule: 'BIWEEKLY' },
  { id: 'WEEKLY', label: 'Weekly', schedule: 'WEEKLY' },
  { id: 'VARIABLE', label: 'Variable', schedule: 'VARIABLE' },
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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
  const [semiDay1, setSemiDay1] = useState('15');
  const [semiDay2, setSemiDay2] = useState('30');
  const [weekday, setWeekday] = useState(5);
  const [ordinal1, setOrdinal1] = useState(2);
  const [ordinal2, setOrdinal2] = useState(4);
  const [monthlyPayDay, setMonthlyPayDay] = useState('30');
  const [anchorDate, setAnchorDate] = useState('');
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

    const liquidAccounts = accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
    const defaultAccount = liquidAccounts[0]?.id ?? accounts[0]?.id ?? '';
    const defaultCategory =
      incomeCategories.find((c) => c.id === 'cat-salary')?.id ??
      incomeCategories[0]?.id ??
      'cat-salary';

    if (editingSource) {
      setNameInput(editingSource.name);
      setPaySchedule(editingSource.paySchedule);
      setSemiDay1(String(editingSource.payDays?.[0] ?? 15));
      setSemiDay2(String(editingSource.payDays?.[1] ?? 30));
      setWeekday(editingSource.weekday ?? 5);
      setOrdinal1(editingSource.weekdayOrdinals?.[0] ?? 2);
      setOrdinal2(editingSource.weekdayOrdinals?.[1] ?? 4);
      setMonthlyPayDay(String(editingSource.monthlyPayDay ?? 30));
      setAnchorDate(editingSource.anchorDate ?? '');
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
      setSemiDay1('15');
      setSemiDay2('30');
      setWeekday(5);
      setOrdinal1(2);
      setOrdinal2(4);
      setMonthlyPayDay('30');
      setAnchorDate('');
      setPayDaysLabel('15th & 30th');
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

  const handleSelectScheduleOption = (opt: SchedulePresetOption) => {
    setPaySchedule(opt.schedule);
    if (opt.id === '15_30') {
      setSemiDay1('15');
      setSemiDay2('30');
      setPayDaysLabel('15th & 30th');
    } else if (opt.id === '2_4_FRI') {
      setWeekday(5);
      setOrdinal1(2);
      setOrdinal2(4);
      setPayDaysLabel('2nd & 4th Friday');
    } else {
      setPayDaysLabel('');
      if (
        (opt.schedule === 'WEEKLY' || opt.schedule === 'BIWEEKLY') &&
        !anchorDate.trim()
      ) {
        setAnchorDate(formatCalendarDateString(new Date()));
      }
    }
  };

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

    let payDaysTuple: [number, number] | undefined;
    if (paySchedule === 'SEMI_MONTHLY') {
      const d1 = Number.parseInt(semiDay1.trim(), 10);
      const d2 = Number.parseInt(semiDay2.trim(), 10);
      if (
        !Number.isInteger(d1) ||
        d1 < 1 ||
        d1 > 31 ||
        !Number.isInteger(d2) ||
        d2 < 1 ||
        d2 > 31
      ) {
        setFormError('Paydays must be day numbers between 1 and 31.');
        return;
      }
      payDaysTuple = [d1, d2];
    }

    let parsedMonthlyDay: number | undefined;
    if (paySchedule === 'MONTHLY') {
      const d = Number.parseInt(monthlyPayDay.trim(), 10);
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        setFormError('Monthly payday must be between 1 and 31.');
        return;
      }
      parsedMonthlyDay = d;
    }

    let validatedAnchorDate: string | undefined;
    const trimmedAnchor = anchorDate.trim();
    if (paySchedule === 'WEEKLY' || paySchedule === 'BIWEEKLY') {
      if (!parseDateInputToIso(trimmedAnchor)) {
        setFormError('Anchor payday must be a valid YYYY-MM-DD date.');
        return;
      }
      validatedAnchorDate = trimmedAnchor;
    } else if (paySchedule !== 'VARIABLE' && trimmedAnchor.length > 0) {
      if (!parseDateInputToIso(trimmedAnchor)) {
        setFormError('First payday date must be a valid YYYY-MM-DD date.');
        return;
      }
      validatedAnchorDate = trimmedAnchor;
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
        ...(payDaysTuple ? { payDays: payDaysTuple } : {}),
        ...(paySchedule === 'TWICE_MONTHLY_WEEKDAY'
          ? { weekday, weekdayOrdinals: [ordinal1, ordinal2] as [number, number] }
          : {}),
        ...(parsedMonthlyDay !== undefined ? { monthlyPayDay: parsedMonthlyDay } : {}),
        ...(validatedAnchorDate ? { anchorDate: validatedAnchorDate } : {}),
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

  const liquidAccounts = accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
  const depositAccounts = liquidAccounts.length > 0 ? liquidAccounts : accounts;

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
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <ThemedText
                  accessibilityRole="header"
                  className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {editingSource ? 'Edit Job / Payday' : 'Add Job / Payday'}
                </ThemedText>
                <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Powers your Safe to Spend until Next Payday calculation
                </ThemedText>
              </View>

              <Pressable
                onPress={onClose}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <AppIcon name="close" size={18} color={theme.textSecondary} />
              </Pressable>
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

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
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
                    placeholder="e.g. Main Job, Part-Time Work"
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Job or income source name"
                    maxLength={60}
                    editable={!isSubmitting}
                    className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-medium text-ledger-ink dark:text-ledger-ink-dark"
                  />
                </View>

                {/* Quick Schedule Presets */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Payday Schedule
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {SCHEDULE_OPTIONS.map((opt) => {
                      const isSelected = paySchedule === opt.schedule;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => handleSelectScheduleOption(opt)}
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

                {/* Conditional Schedule Day Pickers */}
                {paySchedule === 'SEMI_MONTHLY' && (
                  <View className="flex-row gap-3">
                    <View className="flex-1 gap-1.5">
                      <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        1st Pay Day
                      </ThemedText>
                      <TextInput
                        value={semiDay1}
                        onChangeText={(t) => setSemiDay1(t.replace(/[^0-9]/g, ''))}
                        placeholder="15"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="number-pad"
                        maxLength={2}
                        style={TABULAR_NUMS_STYLE}
                        className="h-11 px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                      />
                    </View>
                    <View className="flex-1 gap-1.5">
                      <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        2nd Pay Day
                      </ThemedText>
                      <TextInput
                        value={semiDay2}
                        onChangeText={(t) => setSemiDay2(t.replace(/[^0-9]/g, ''))}
                        placeholder="30"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="number-pad"
                        maxLength={2}
                        style={TABULAR_NUMS_STYLE}
                        className="h-11 px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                      />
                    </View>
                  </View>
                )}

                {paySchedule === 'TWICE_MONTHLY_WEEKDAY' && (
                  <View className="gap-2.5">
                    <View className="gap-1.5">
                      <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        Day of Week ({ordinal1 === 1 ? '1st' : ordinal1 === 2 ? '2nd' : ordinal1 === 3 ? '3rd' : '4th'} &amp;{' '}
                        {ordinal2 === 1 ? '1st' : ordinal2 === 2 ? '2nd' : ordinal2 === 3 ? '3rd' : '4th'})
                      </ThemedText>
                      <View className="flex-row flex-wrap gap-1.5">
                        {WEEKDAY_NAMES.map((dayName, idx) => {
                          const isSelected = weekday === idx;
                          return (
                            <Pressable
                              key={dayName}
                              onPress={() => setWeekday(idx)}
                              accessibilityRole="button"
                              accessibilityLabel={`Select ${dayName}`}
                              accessibilityState={{ selected: isSelected }}
                              className={`min-h-[44px] min-w-[44px] px-2.5 rounded-xl border items-center justify-center ${
                                isSelected
                                  ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                                  : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                              }`}
                            >
                              <ThemedText
                                className={`text-xs font-bold ${
                                  isSelected
                                    ? 'text-brand-500 dark:text-brand-400'
                                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                                }`}
                              >
                                {dayName}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View className="flex-row flex-wrap gap-2">
                      {(
                        [
                          [1, 3],
                          [2, 4],
                        ] as const
                      ).map(([o1, o2]) => {
                        const isSelected = ordinal1 === o1 && ordinal2 === o2;
                        return (
                          <Pressable
                            key={`${o1}-${o2}`}
                            onPress={() => {
                              setOrdinal1(o1);
                              setOrdinal2(o2);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${o1} and ${o2} weeks`}
                            accessibilityState={{ selected: isSelected }}
                            className={`min-h-[44px] px-3.5 rounded-xl border items-center justify-center ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                            }`}
                          >
                            <ThemedText
                              className={`text-xs font-bold ${
                                isSelected
                                  ? 'text-brand-500 dark:text-brand-400'
                                  : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                              }`}
                            >
                              {o1 === 1 ? '1st & 3rd' : '2nd & 4th'} of Month
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {paySchedule === 'MONTHLY' && (
                  <View className="gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Monthly Pay Day (1–31)
                    </ThemedText>
                    <TextInput
                      value={monthlyPayDay}
                      onChangeText={(t) => setMonthlyPayDay(t.replace(/[^0-9]/g, ''))}
                      placeholder="30"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="number-pad"
                      maxLength={2}
                      style={TABULAR_NUMS_STYLE}
                      className="h-11 px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                    />
                  </View>
                )}

                {paySchedule !== 'VARIABLE' && (
                  <View className="gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      {paySchedule === 'WEEKLY' || paySchedule === 'BIWEEKLY'
                        ? 'Sample Payday Date (YYYY-MM-DD)'
                        : 'First Payday / Starts On (Optional, YYYY-MM-DD)'}
                    </ThemedText>
                    <TextInput
                      value={anchorDate}
                      onChangeText={setAnchorDate}
                      placeholder={
                        paySchedule === 'WEEKLY' || paySchedule === 'BIWEEKLY'
                          ? 'YYYY-MM-DD'
                          : 'e.g. 2026-12-16'
                      }
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel="First payday or anchor date in YYYY-MM-DD format"
                      style={TABULAR_NUMS_STYLE}
                      editable={!isSubmitting}
                      className="h-11 px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-medium text-ledger-ink dark:text-ledger-ink-dark"
                    />
                    {paySchedule !== 'WEEKLY' && paySchedule !== 'BIWEEKLY' ? (
                      <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                        Leave blank to start immediately, or enter e.g. 2026-12-16 to skip
                        earlier paydays.
                      </ThemedText>
                    ) : null}
                  </View>
                )}

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
                      {`Per Payday (${DEFAULT_CURRENCY_SYMBOL})`}
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

                {/* Deposit Account */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Deposit Account
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {depositAccounts.map((acc) => {
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

                {editingSource && (
                  <View className="p-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark">
                        Active Schedule
                      </ThemedText>
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                        Include in upcoming paydays and Safe to Spend
                      </ThemedText>
                    </View>
                    <Switch
                      value={isActive}
                      onValueChange={setIsActive}
                      disabled={isSubmitting}
                      accessibilityLabel="Include job in upcoming paydays"
                      trackColor={{ false: theme.borderStrong, true: theme.primary }}
                      thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
                    />
                  </View>
                )}
              </View>
            </ScrollView>

            <View className="gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
              <Pressable
                onPress={handleSave}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={editingSource ? 'Save Job Changes' : 'Save Job'}
                className={`min-h-[44px] py-3 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-85 ${
                  isSubmitting ? 'opacity-60' : ''
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={theme.onPrimary} />
                ) : (
                  <ThemedText className="text-sm font-bold text-ledger-canvas dark:text-brand-900">
                    {editingSource ? 'Save Changes' : 'Save Payday Schedule'}
                  </ThemedText>
                )}
              </Pressable>

              {editingSource && !confirmingDelete && (
                <Pressable
                  onPress={() => setConfirmingDelete(true)}
                  disabled={isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Remove job"
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
                    Remove &quot;{editingSource.name}&quot;? Past payday entries will stay
                    in your ledger.
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
