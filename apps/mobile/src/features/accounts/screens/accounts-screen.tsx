import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ACCOUNT_TYPE_LABELS,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  formatMinorUnits,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type Account,
  type AccountType,
} from '@repo/contracts';

import { ThemedText } from '@/common/components/themed-text';
import { BottomTabInset, Colors } from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAccounts,
  useDeleteAccount,
  useUpsertAccount,
} from '@/features/transactions/hooks/use-transactions';

type AccountFilter = 'ALL' | AccountType;

interface AccountTypeConfig {
  value: AccountType;
  label: string;
  tagLabel: string;
  defaultIcon: string;
  defaultColor: string;
  pillBg: string;
  pillText: string;
}

interface AccountQuickPreset {
  name: string;
  icon: string;
  color: string;
  accountType: AccountType;
}

const ACCOUNT_TYPE_OPTIONS: readonly AccountTypeConfig[] = [
  {
    value: 'BANK',
    label: '🏦 Bank',
    tagLabel: ACCOUNT_TYPE_LABELS.BANK,
    defaultIcon: '🏦',
    defaultColor: '#208AEF',
    pillBg: 'bg-brand-50 dark:bg-brand-950/50 border-brand-200/80 dark:border-brand-800/70',
    pillText: 'text-brand-700 dark:text-brand-300',
  },
  {
    value: 'E_WALLET',
    label: '📱 E-Wallet',
    tagLabel: ACCOUNT_TYPE_LABELS.E_WALLET,
    defaultIcon: '📱',
    defaultColor: '#10B981',
    pillBg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/70',
    pillText: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    value: 'CASH',
    label: '💵 Cash',
    tagLabel: ACCOUNT_TYPE_LABELS.CASH,
    defaultIcon: '💵',
    defaultColor: '#F59E0B',
    pillBg: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/70',
    pillText: 'text-amber-700 dark:text-amber-300',
  },
  {
    value: 'CREDIT_CARD',
    label: '💳 Credit Card',
    tagLabel: ACCOUNT_TYPE_LABELS.CREDIT_CARD,
    defaultIcon: '💳',
    defaultColor: '#8B5CF6',
    pillBg: 'bg-violet-50 dark:bg-violet-950/50 border-violet-200/80 dark:border-violet-800/70',
    pillText: 'text-violet-700 dark:text-violet-300',
  },
];

const ACCOUNT_TYPE_CONFIG_MAP = new Map<AccountType, AccountTypeConfig>(
  ACCOUNT_TYPE_OPTIONS.map((opt) => [opt.value, opt]),
);

const ACCOUNT_PRESETS: readonly AccountQuickPreset[] = [
  { name: 'BPI', icon: '🏦', color: '#EF4444', accountType: 'BANK' },
  { name: 'BDO', icon: '🏦', color: '#2563EB', accountType: 'BANK' },
  { name: 'UnionBank', icon: '🏛️', color: '#F59E0B', accountType: 'BANK' },
  { name: 'Metrobank', icon: '🏦', color: '#3B82F6', accountType: 'BANK' },
  { name: 'GoTyme', icon: '💎', color: '#06B6D4', accountType: 'BANK' },
  { name: 'SeaBank', icon: '🌊', color: '#F97316', accountType: 'BANK' },
  { name: 'GCash', icon: '📱', color: '#208AEF', accountType: 'E_WALLET' },
  { name: 'Maya', icon: '💚', color: '#10B981', accountType: 'E_WALLET' },
  { name: 'GrabPay', icon: '🟢', color: '#059669', accountType: 'E_WALLET' },
  { name: 'ShopeePay', icon: '🟠', color: '#F97316', accountType: 'E_WALLET' },
  { name: 'Cash on Hand', icon: '💵', color: '#10B981', accountType: 'CASH' },
  { name: 'Petty Cash', icon: '🪙', color: '#F59E0B', accountType: 'CASH' },
  { name: 'BPI Credit', icon: '💳', color: '#EF4444', accountType: 'CREDIT_CARD' },
  { name: 'BDO Credit', icon: '💳', color: '#8B5CF6', accountType: 'CREDIT_CARD' },
  { name: 'UnionBank Card', icon: '💳', color: '#F59E0B', accountType: 'CREDIT_CARD' },
  { name: 'Metrobank Card', icon: '💳', color: '#3B82F6', accountType: 'CREDIT_CARD' },
];

const ACCOUNT_ICONS = ['🏦', '🏛️', '📱', '💚', '💳', '💵', '🪙', '🐷', '💎', '🌊'] as const;

const ACCOUNT_COLOR_OPTIONS = [
  { label: 'Blue', value: '#208AEF' },
  { label: 'Emerald', value: '#10B981' },
  { label: 'Violet', value: '#8B5CF6' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Rose', value: '#EF4444' },
  { label: 'Cyan', value: '#06B6D4' },
] as const;

const FILTER_OPTIONS: readonly { key: AccountFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'BANK', label: '🏦 Bank' },
  { key: 'E_WALLET', label: '📱 E-Wallet' },
  { key: 'CASH', label: '💵 Cash' },
  { key: 'CREDIT_CARD', label: '💳 Credit Card' },
];

function getTypeConfig(accountType: AccountType): AccountTypeConfig {
  return ACCOUNT_TYPE_CONFIG_MAP.get(accountType) ?? ACCOUNT_TYPE_OPTIONS[0];
}

interface AccountCardProps {
  account: Account;
  onEdit: (account: Account) => void;
  onReconcile: () => void;
}

function AccountCard({ account, onEdit, onReconcile }: AccountCardProps) {
  const formattedBalance = formatMinorUnits(account.balanceMinor, account.currency);
  const typeConfig = getTypeConfig(account.accountType);

  return (
    <View className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex-row flex-wrap items-center justify-between gap-3">
      <View className="flex-row items-center gap-3 flex-1 min-w-[200px]">
        <View className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 items-center justify-center shrink-0">
          <ThemedText className="text-xl">{account.icon}</ThemedText>
        </View>
        <View className="flex-1 min-w-0 gap-1">
          <View className="flex-row items-center flex-wrap gap-2">
            <ThemedText
              className="text-base font-bold text-slate-900 dark:text-white"
              numberOfLines={1}
            >
              {account.name}
            </ThemedText>
            <View className={`px-2 py-0.5 rounded-full border ${typeConfig.pillBg}`}>
              <ThemedText
                className={`text-[10px] font-bold uppercase tracking-wider ${typeConfig.pillText}`}
              >
                {typeConfig.tagLabel}
              </ThemedText>
            </View>
          </View>
          <ThemedText
            className="text-base font-extrabold font-mono"
            style={{ color: account.color }}
          >
            {formattedBalance}
          </ThemedText>
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onReconcile}
          accessibilityRole="button"
          accessibilityLabel={`Reconcile ${account.name}`}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/50 items-center justify-center active:opacity-75"
        >
          <ThemedText className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Reconcile
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => onEdit(account)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${account.name}`}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
        >
          <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Edit
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export function AccountsScreen() {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const upsertAccountMutation = useUpsertAccount();
  const deleteAccountMutation = useDeleteAccount();

  const [filter, setFilter] = useState<AccountFilter>('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('BANK');
  const [balanceInput, setBalanceInput] = useState('0');
  const [selectedIcon, setSelectedIcon] = useState('🏦');
  const [selectedColor, setSelectedColor] = useState<string>(ACCOUNT_COLOR_OPTIONS[0].value);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredAccounts = useMemo(
    () =>
      filter === 'ALL'
        ? accounts
        : accounts.filter((a) => a.accountType === filter),
    [accounts, filter],
  );

  const cashAndBankAccounts = useMemo(
    () => accounts.filter((a) => a.accountType !== 'CREDIT_CARD'),
    [accounts],
  );
  const creditCardAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === 'CREDIT_CARD'),
    [accounts],
  );

  const totalBalanceMinor = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balanceMinor, 0),
    [accounts],
  );
  const cashAndBankTotalMinor = useMemo(
    () => cashAndBankAccounts.reduce((sum, a) => sum + a.balanceMinor, 0),
    [cashAndBankAccounts],
  );
  const creditCardTotalMinor = useMemo(
    () => creditCardAccounts.reduce((sum, a) => sum + a.balanceMinor, 0),
    [creditCardAccounts],
  );

  const filteredPresets = useMemo(
    () => ACCOUNT_PRESETS.filter((preset) => preset.accountType === accountType),
    [accountType],
  );

  const openAddModal = (initialType: AccountType = 'BANK') => {
    const config = getTypeConfig(initialType);
    setEditingAccount(null);
    setAccountType(initialType);
    setNameInput('');
    setBalanceInput('0');
    setSelectedIcon(config.defaultIcon);
    setSelectedColor(config.defaultColor);
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setAccountType(account.accountType);
    setNameInput(account.name);
    setBalanceInput(minorUnitsToDecimalInput(account.balanceMinor));
    setSelectedIcon(account.icon);
    setSelectedColor(account.color);
    setFormError(null);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    if (upsertAccountMutation.isPending || deleteAccountMutation.isPending) {
      return;
    }
    setModalVisible(false);
    setFormError(null);
  };

  const handleSelectAccountType = (nextType: AccountType) => {
    setAccountType(nextType);
    if (!editingAccount) {
      const config = getTypeConfig(nextType);
      setSelectedIcon(config.defaultIcon);
      setSelectedColor(config.defaultColor);
    }
    setFormError(null);
  };

  const handleApplyPreset = (preset: AccountQuickPreset) => {
    setNameInput(preset.name);
    setSelectedIcon(preset.icon);
    setSelectedColor(preset.color);
    setAccountType(preset.accountType);
    setFormError(null);
  };

  const handleSave = async () => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setFormError('Please enter an account name.');
      return;
    }

    const parsedBalanceMinor = parseDecimalToMinorUnits(balanceInput);
    if (parsedBalanceMinor === null) {
      setFormError('Please enter a valid numeric balance (up to 2 decimal places).');
      return;
    }

    setFormError(null);
    try {
      await upsertAccountMutation.mutateAsync({
        ...(editingAccount ? { id: editingAccount.id } : {}),
        name: trimmedName,
        accountType,
        icon: selectedIcon,
        color: selectedColor,
        currency: editingAccount?.currency ?? DEFAULT_CURRENCY,
        balanceMinor: parsedBalanceMinor,
      });
      setModalVisible(false);
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Failed to save account. Please try again.',
      );
    }
  };

  const handleDelete = async () => {
    if (!editingAccount) return;
    setFormError(null);
    try {
      await deleteAccountMutation.mutateAsync(editingAccount.id);
      setModalVisible(false);
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Could not delete this account.',
      );
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const isBusy = upsertAccountMutation.isPending || deleteAccountMutation.isPending;
  const activeCreateType: AccountType = filter === 'ALL' ? 'BANK' : filter;
  const listTitle =
    filter === 'ALL'
      ? 'All Accounts'
      : `${ACCOUNT_TYPE_LABELS[filter]} Accounts`;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(96, BottomTabInset + 32),
            gap: 20,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View className="flex-1 min-w-[200px] gap-0.5">
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white"
              >
                Accounts
              </ThemedText>
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400">
                Banks, e-wallets, cash, and credit cards in one place
              </ThemedText>
            </View>

            <Pressable
              onPress={() => openAddModal(activeCreateType)}
              accessibilityRole="button"
              accessibilityLabel="Add account"
              className="min-h-[44px] px-4 py-2.5 rounded-full bg-brand-500 active:bg-brand-600 shadow-md shadow-brand-500/25 flex-row items-center justify-center"
            >
              <ThemedText className="text-white text-xs sm:text-sm font-bold">
                + Add Account
              </ThemedText>
            </Pressable>
          </View>

          {/* Loading / Error / Content */}
          {accountsQuery.isLoading ? (
            <View className="py-12 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={theme.text} />
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400">
                Loading your accounts...
              </ThemedText>
            </View>
          ) : accountsQuery.isError ? (
            <View className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 items-center gap-3">
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-rose-600 dark:text-rose-400 text-center"
              >
                Could not load your accounts right now.
              </ThemedText>
              <Pressable
                onPress={() => accountsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading accounts"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 active:bg-rose-700 items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-white">Retry</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Summary KPI Row */}
              <View className="flex-row flex-wrap gap-3">
                <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-slate-900 dark:bg-slate-900 border border-slate-800 shadow-sm gap-1">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Total Balance
                  </ThemedText>
                  <ThemedText className="text-xl font-extrabold font-mono text-white">
                    {formatMinorUnits(totalBalanceMinor)}
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-400">
                    {accounts.length} active {accounts.length === 1 ? 'account' : 'accounts'}
                  </ThemedText>
                </View>

                <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-1">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Bank, E-Wallet & Cash
                  </ThemedText>
                  <ThemedText className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatMinorUnits(cashAndBankTotalMinor)}
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                    {cashAndBankAccounts.length} {cashAndBankAccounts.length === 1 ? 'account' : 'accounts'}
                  </ThemedText>
                </View>

                <View className="flex-1 min-w-[160px] p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm gap-1">
                  <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Credit Cards
                  </ThemedText>
                  <ThemedText className="text-xl font-extrabold font-mono text-violet-600 dark:text-violet-400">
                    {formatMinorUnits(creditCardTotalMinor)}
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                    {creditCardAccounts.length} {creditCardAccounts.length === 1 ? 'card' : 'cards'}
                  </ThemedText>
                </View>
              </View>

              {/* Single-Row Scrollable Account Type Filter Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 py-0.5"
              >
                {FILTER_OPTIONS.map((option) => {
                  const isSelected = filter === option.key;
                  const count =
                    option.key === 'ALL'
                      ? accounts.length
                      : accounts.filter((a) => a.accountType === option.key).length;

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setFilter(option.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter ${option.label}, ${count} accounts`}
                      accessibilityState={{ selected: isSelected }}
                      className={`min-h-[44px] px-4 py-2 rounded-full flex-row items-center justify-center gap-1.5 border ${
                        isSelected
                          ? 'bg-brand-500 border-brand-600 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 active:opacity-75'
                      }`}
                    >
                      {isSelected && (
                        <ThemedText className="text-xs font-extrabold text-white">
                          ✓
                        </ThemedText>
                      )}
                      <ThemedText
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {option.label} ({count})
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Unified Accounts List */}
              <View className="gap-3">
                <View className="flex-row items-center justify-between gap-2">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {listTitle}
                  </ThemedText>
                  <Pressable
                    onPress={() => openAddModal(activeCreateType)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${activeCreateType} account`}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    className="py-1 px-1 active:opacity-75"
                  >
                    <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
                      + New Account
                    </ThemedText>
                  </Pressable>
                </View>

                {filteredAccounts.length === 0 ? (
                  <View className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 items-center gap-3">
                    <ThemedText className="text-2xl">
                      {filter === 'ALL' ? '🏦' : getTypeConfig(filter).defaultIcon}
                    </ThemedText>
                    <ThemedText className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">
                      {filter === 'ALL'
                        ? 'No accounts added yet'
                        : `No ${ACCOUNT_TYPE_LABELS[filter].toLowerCase()} accounts yet`}
                    </ThemedText>
                    <Pressable
                      onPress={() => openAddModal(activeCreateType)}
                      accessibilityRole="button"
                      accessibilityLabel="Add Account"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-white">
                        + Add {filter === 'ALL' ? 'Account' : ACCOUNT_TYPE_LABELS[filter]}
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View className="gap-3">
                    {filteredAccounts.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        onEdit={openEditModal}
                        onReconcile={() => router.push('/reconciliation')}
                      />
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Add / Edit Account Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            className="flex-1 bg-slate-950/60 items-center justify-center p-4"
          >
            <Pressable
              onPress={handleCloseModal}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Close dialog backdrop"
              className="absolute inset-0"
            />
            <View className="relative z-10 w-full max-w-[480px] max-h-[90%] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 16 }}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-1">
                    <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                      {editingAccount ? 'Edit Account' : 'Add Account'}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                      Tag as Bank, E-Wallet, Cash, or Credit Card
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={handleCloseModal}
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

                {/* Account Type Tag Selector */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Account Type
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {ACCOUNT_TYPE_OPTIONS.map((option) => {
                      const isSelected = accountType === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => handleSelectAccountType(option.value)}
                          accessibilityRole="button"
                          accessibilityLabel={option.tagLabel}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex-row items-center justify-center gap-1.5 ${
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
                          <ThemedText
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-brand-600 dark:text-brand-300'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {option.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Quick Presets */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Quick Presets
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {filteredPresets.map((preset) => (
                      <Pressable
                        key={preset.name}
                        onPress={() => handleApplyPreset(preset)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${preset.name} preset`}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-row items-center gap-1.5 active:opacity-75"
                      >
                        <ThemedText className="text-sm">{preset.icon}</ThemedText>
                        <ThemedText className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {preset.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Name Input */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Account Name
                  </ThemedText>
                  <TextInput
                    value={nameInput}
                    onChangeText={(text) => {
                      setNameInput(text);
                      if (formError) setFormError(null);
                    }}
                    placeholder={
                      accountType === 'E_WALLET'
                        ? 'e.g. GCash, Maya'
                        : accountType === 'BANK'
                          ? 'e.g. BPI Savings, BDO Payroll'
                          : accountType === 'CREDIT_CARD'
                            ? 'e.g. BPI Credit Card'
                            : 'e.g. Cash on Hand'
                    }
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel="Account name"
                    editable={!isBusy}
                    className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-base"
                  />
                </View>

                {/* Balance Input */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {editingAccount ? 'Current Balance' : 'Starting Balance'}
                  </ThemedText>
                  <View className="h-12 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex-row items-center">
                    <ThemedText className="text-lg font-bold text-slate-400 dark:text-slate-500 mr-2">
                      {DEFAULT_CURRENCY_SYMBOL}
                    </ThemedText>
                    <TextInput
                      value={balanceInput}
                      onChangeText={(text) => {
                        setBalanceInput(text);
                        if (formError) setFormError(null);
                      }}
                      placeholder="0.00"
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel="Starting balance"
                      keyboardType="decimal-pad"
                      editable={!isBusy}
                      className="flex-1 h-full text-slate-900 dark:text-slate-100 text-base font-bold"
                    />
                  </View>
                </View>

                {/* Icon Picker */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Icon
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {ACCOUNT_ICONS.map((icon) => {
                      const isSelected = selectedIcon === icon;
                      return (
                        <Pressable
                          key={icon}
                          onPress={() => setSelectedIcon(icon)}
                          accessibilityRole="button"
                          accessibilityLabel={`Select icon ${icon}`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-w-[44px] min-h-[44px] rounded-xl border items-center justify-center ${
                            isSelected
                              ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-500'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:opacity-75'
                          }`}
                        >
                          <ThemedText className="text-lg">{icon}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Accent Color Swatches */}
                <View className="gap-1.5">
                  <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Accent Color
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2.5">
                    {ACCOUNT_COLOR_OPTIONS.map((swatch) => {
                      const isSelected = selectedColor === swatch.value;
                      return (
                        <Pressable
                          key={swatch.value}
                          onPress={() => setSelectedColor(swatch.value)}
                          accessibilityRole="button"
                          accessibilityLabel={`Select ${swatch.label} color`}
                          accessibilityState={{ selected: isSelected }}
                          className={`min-w-[44px] min-h-[44px] rounded-full items-center justify-center border-2 ${
                            isSelected
                              ? 'border-slate-900 dark:border-white'
                              : 'border-transparent'
                          }`}
                        >
                          <View
                            className="w-8 h-8 rounded-full"
                            style={{ backgroundColor: swatch.value }}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Modal Actions */}
                <View className="gap-2.5 pt-2">
                  <Pressable
                    onPress={handleSave}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={editingAccount ? 'Save changes' : 'Save account'}
                    className={`min-h-[44px] py-3 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-md shadow-brand-500/25 ${
                      isBusy ? 'opacity-70' : ''
                    }`}
                  >
                    {upsertAccountMutation.isPending ? (
                      <ActivityIndicator size="small" color={Colors.dark.text} />
                    ) : (
                      <ThemedText className="text-sm font-bold text-white">
                        {editingAccount ? 'Save Changes' : 'Save Account'}
                      </ThemedText>
                    )}
                  </Pressable>

                  <View className="flex-row gap-2.5">
                    <Pressable
                      onPress={handleCloseModal}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                      className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-center justify-center active:opacity-75"
                    >
                      <ThemedText className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Cancel
                      </ThemedText>
                    </Pressable>

                    {editingAccount ? (
                      <Pressable
                        onPress={handleDelete}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${editingAccount.name}`}
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 items-center justify-center active:opacity-75"
                      >
                        {deleteAccountMutation.isPending ? (
                          <ActivityIndicator size="small" color={theme.text} />
                        ) : (
                          <ThemedText className="text-xs font-bold text-rose-600 dark:text-rose-400">
                            Delete
                          </ThemedText>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
