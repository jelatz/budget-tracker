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
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type Account,
  type AccountType,
} from '@repo/contracts';

import { AppIcon, type AppIconName } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
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
  iconName: AppIconName;
  defaultIcon: string;
  defaultColor: string;
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
    label: 'Bank',
    tagLabel: ACCOUNT_TYPE_LABELS.BANK,
    iconName: 'accounts',
    defaultIcon: '🏦',
    defaultColor: '#1B4332',
  },
  {
    value: 'E_WALLET',
    label: 'E-Wallet',
    tagLabel: ACCOUNT_TYPE_LABELS.E_WALLET,
    iconName: 'wallet',
    defaultIcon: '📱',
    defaultColor: '#1E6F4E',
  },
  {
    value: 'CASH',
    label: 'Cash',
    tagLabel: ACCOUNT_TYPE_LABELS.CASH,
    iconName: 'wallet',
    defaultIcon: '💵',
    defaultColor: '#A16207',
  },
  {
    value: 'CREDIT_CARD',
    label: 'Credit Card',
    tagLabel: ACCOUNT_TYPE_LABELS.CREDIT_CARD,
    iconName: 'creditCard',
    defaultIcon: '💳',
    defaultColor: '#2C5F6E',
  },
];

const ACCOUNT_TYPE_CONFIG_MAP = new Map<AccountType, AccountTypeConfig>(
  ACCOUNT_TYPE_OPTIONS.map((opt) => [opt.value, opt]),
);

const ACCOUNT_PRESETS: readonly AccountQuickPreset[] = [
  { name: 'BPI', icon: '🏦', color: '#B4432C', accountType: 'BANK' },
  { name: 'BDO', icon: '🏦', color: '#2C5F6E', accountType: 'BANK' },
  { name: 'UnionBank', icon: '🏛️', color: '#A16207', accountType: 'BANK' },
  { name: 'Metrobank', icon: '🏦', color: '#2C5F6E', accountType: 'BANK' },
  { name: 'GoTyme', icon: '💎', color: '#2C5F6E', accountType: 'BANK' },
  { name: 'SeaBank', icon: '🌊', color: '#A16207', accountType: 'BANK' },
  { name: 'GCash', icon: '📱', color: '#2C5F6E', accountType: 'E_WALLET' },
  { name: 'Maya', icon: '💚', color: '#1E6F4E', accountType: 'E_WALLET' },
  { name: 'GrabPay', icon: '🟢', color: '#1B4332', accountType: 'E_WALLET' },
  { name: 'ShopeePay', icon: '🟠', color: '#B4432C', accountType: 'E_WALLET' },
  { name: 'Cash on Hand', icon: '💵', color: '#1E6F4E', accountType: 'CASH' },
  { name: 'Petty Cash', icon: '🪙', color: '#A16207', accountType: 'CASH' },
  { name: 'BPI Credit', icon: '💳', color: '#B4432C', accountType: 'CREDIT_CARD' },
  { name: 'BDO Credit', icon: '💳', color: '#2C5F6E', accountType: 'CREDIT_CARD' },
  { name: 'UnionBank Card', icon: '💳', color: '#A16207', accountType: 'CREDIT_CARD' },
  { name: 'Metrobank Card', icon: '💳', color: '#5C584F', accountType: 'CREDIT_CARD' },
];

const ACCOUNT_ICONS = ['🏦', '🏛️', '📱', '💚', '💳', '💵', '🪙', '🐷', '💎', '🌊'] as const;

const ACCOUNT_COLOR_OPTIONS = [
  { label: 'Forest Pine', value: '#1B4332' },
  { label: 'Sage Pine', value: '#1E6F4E' },
  { label: 'Deep Teal', value: '#2C5F6E' },
  { label: 'Warm Ochre', value: '#A16207' },
  { label: 'Terracotta', value: '#B4432C' },
  { label: 'Warm Charcoal', value: '#5C584F' },
] as const;

const FILTER_OPTIONS: readonly { key: AccountFilter; label: string; iconName?: AppIconName }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'BANK', label: 'Bank', iconName: 'accounts' },
  { key: 'E_WALLET', label: 'E-Wallet', iconName: 'wallet' },
  { key: 'CASH', label: 'Cash', iconName: 'wallet' },
  { key: 'CREDIT_CARD', label: 'Credit Card', iconName: 'creditCard' },
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
  const theme = useTheme();
  const formattedBalance = formatMinorUnits(account.balanceMinor, account.currency);
  const typeConfig = getTypeConfig(account.accountType);
  const isNegative = account.balanceMinor < 0;

  return (
    <View className="p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <View className="w-11 h-11 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
            <ThemedText className="text-xl">{account.icon}</ThemedText>
          </View>

          <View className="flex-1 min-w-0 gap-0.5">
            <View className="flex-row items-center gap-2">
              <View
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: account.color }}
              />
              <ThemedText
                className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                numberOfLines={1}
              >
                {account.name}
              </ThemedText>
            </View>
            <ThemedText
              className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
              numberOfLines={1}
            >
              {typeConfig.tagLabel} · {account.currency}
            </ThemedText>
          </View>
        </View>

        <ThemedText
          numeric
          className={`text-base sm:text-lg font-extrabold shrink-0 ${
            isNegative
              ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
              : 'text-ledger-ink dark:text-ledger-ink-dark'
          }`}
        >
          {formattedBalance}
        </ThemedText>
      </View>

      <View className="flex-row items-center justify-end gap-2 pt-2.5 border-t border-ledger-border dark:border-ledger-border-dark">
        <Pressable
          onPress={() => onEdit(account)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${account.name}`}
          className="min-h-[44px] px-3.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
        >
          <AppIcon name="edit" size={14} color={theme.textSecondary} />
          <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
            Edit
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={onReconcile}
          accessibilityRole="button"
          accessibilityLabel={`Reconcile ${account.name}`}
          className="min-h-[44px] px-3.5 rounded-xl bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-center gap-1.5 active:opacity-75"
        >
          <AppIcon name="reconcile" size={14} color={theme.positive} />
          <ThemedText className="text-xs font-semibold text-ledger-pine dark:text-ledger-pine-dark">
            Reconcile
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    setConfirmingDelete(false);
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
    setConfirmingDelete(false);
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
    setConfirmingDelete(false);
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
      setConfirmingDelete(false);
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
      ? 'Active Accounts'
      : `${ACCOUNT_TYPE_LABELS[filter]} Accounts`;
  const emptyIconName: AppIconName =
    filter === 'ALL' ? 'accounts' : getTypeConfig(filter).iconName;

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: Math.max(96, BottomTabInset + 32),
            gap: 20,
            ...(Platform.OS === 'web'
              ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
              : {}),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View className="flex-1 min-w-[200px] gap-0.5">
              <ThemedText
                accessibilityRole="header"
                className="text-[28px] leading-9 font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
              >
                Accounts
              </ThemedText>
              <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Banks, e-wallets, cash, and credit cards
              </ThemedText>
            </View>

            <Pressable
              onPress={() => openAddModal(activeCreateType)}
              accessibilityRole="button"
              accessibilityLabel="Add account"
              className="min-h-[44px] px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-1.5"
            >
              <AppIcon name="add" size={15} color={theme.onPrimary} />
              <ThemedText className="text-xs sm:text-sm font-bold text-ledger-canvas dark:text-brand-900">
                Add Account
              </ThemedText>
            </Pressable>
          </View>

          {/* Loading / Error / Content */}
          {accountsQuery.isLoading ? (
            <View className="py-12 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Loading your accounts...
              </ThemedText>
            </View>
          ) : accountsQuery.isError ? (
            <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3">
              <AppIcon name="warning" size={24} color={theme.negative} />
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center"
              >
                Could not load your accounts right now.
              </ThemedText>
              <Pressable
                onPress={() => accountsQuery.refetch()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading accounts"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Unified Warm Paper Summary Strip */}
              <View className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row overflow-hidden">
                <View className="flex-1 p-3.5 sm:p-4 border-r border-ledger-border dark:border-ledger-border-dark gap-1">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Net Balance
                  </ThemedText>
                  <ThemedText
                    numeric
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    className={`text-base sm:text-xl font-extrabold ${
                      totalBalanceMinor < 0
                        ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                        : 'text-ledger-ink dark:text-ledger-ink-dark'
                    }`}
                  >
                    {formatMinorUnits(totalBalanceMinor)}
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    numberOfLines={1}
                  >
                    {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
                  </ThemedText>
                </View>

                <View className="flex-1 p-3.5 sm:p-4 border-r border-ledger-border dark:border-ledger-border-dark gap-1">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Liquid Cash
                  </ThemedText>
                  <ThemedText
                    numeric
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    className="text-base sm:text-xl font-extrabold text-ledger-pine dark:text-ledger-pine-dark"
                  >
                    {formatMinorUnits(cashAndBankTotalMinor)}
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    numberOfLines={1}
                  >
                    {cashAndBankAccounts.length} {cashAndBankAccounts.length === 1 ? 'account' : 'accounts'}
                  </ThemedText>
                </View>

                <View className="flex-1 p-3.5 sm:p-4 gap-1">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Credit Cards
                  </ThemedText>
                  <ThemedText
                    numeric
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    className={`text-base sm:text-xl font-extrabold ${
                      creditCardTotalMinor < 0
                        ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                        : 'text-ledger-ink dark:text-ledger-ink-dark'
                    }`}
                  >
                    {formatMinorUnits(creditCardTotalMinor)}
                  </ThemedText>
                  <ThemedText
                    numeric
                    className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    numberOfLines={1}
                  >
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
                          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                      }`}
                    >
                      {option.iconName ? (
                        <AppIcon
                          name={option.iconName}
                          size={14}
                          color={isSelected ? theme.primary : theme.textSecondary}
                        />
                      ) : isSelected ? (
                        <AppIcon name="check" size={13} color={theme.primary} />
                      ) : null}
                      <ThemedText
                        numeric
                        className={`text-xs font-semibold ${
                          isSelected
                            ? 'text-brand-500 dark:text-brand-400'
                            : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
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
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {listTitle}
                  </ThemedText>
                  <Pressable
                    onPress={() => openAddModal(activeCreateType)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${activeCreateType} account`}
                    className="min-h-[44px] px-2 items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-semibold text-brand-500 dark:text-brand-400">
                      + New Account
                    </ThemedText>
                  </Pressable>
                </View>

                {filteredAccounts.length === 0 ? (
                  <View className="p-6 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark items-center gap-3">
                    <View className="w-12 h-12 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark items-center justify-center">
                      <AppIcon name={emptyIconName} size={24} color={theme.textMuted} />
                    </View>
                    <ThemedText className="text-sm font-semibold text-ledger-ink dark:text-ledger-ink-dark text-center">
                      {filter === 'ALL'
                        ? 'No accounts added yet'
                        : `No ${ACCOUNT_TYPE_LABELS[filter].toLowerCase()} accounts yet`}
                    </ThemedText>
                    <Pressable
                      onPress={() => openAddModal(activeCreateType)}
                      accessibilityRole="button"
                      accessibilityLabel="Add Account"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-1.5"
                    >
                      <AppIcon name="add" size={15} color={theme.onPrimary} />
                      <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                        Add {filter === 'ALL' ? 'Account' : ACCOUNT_TYPE_LABELS[filter]}
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
            className="flex-1 bg-black/50 items-center justify-center p-4"
          >
            <Pressable
              onPress={handleCloseModal}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Close dialog backdrop"
              className="absolute inset-0"
            />
            <View className="relative z-10 w-full max-w-[480px] max-h-[90%] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 24, gap: 16 }}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-1">
                    <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      {editingAccount ? 'Edit Account' : 'Add Account'}
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      Tag as Bank, E-Wallet, Cash, or Credit Card
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={handleCloseModal}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Close dialog"
                    className="min-w-[44px] min-h-[44px] rounded-xl items-center justify-center bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark active:opacity-75"
                  >
                    <AppIcon name="close" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                {formError ? (
                  <View
                    accessibilityRole="alert"
                    className="p-3.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
                  >
                    <AppIcon name="warning" size={16} color={theme.negative} />
                    <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                      {formError}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Account Type Tag Selector */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
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
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
                          }`}
                        >
                          <AppIcon
                            name={option.iconName}
                            size={14}
                            color={isSelected ? theme.primary : theme.textSecondary}
                          />
                          <ThemedText
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-brand-500 dark:text-brand-400'
                                : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
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
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Quick Presets
                  </ThemedText>
                  <View className="flex-row flex-wrap gap-2">
                    {filteredPresets.map((preset) => (
                      <Pressable
                        key={preset.name}
                        onPress={() => handleApplyPreset(preset)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${preset.name} preset`}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5 active:opacity-75"
                      >
                        <ThemedText className="text-sm">{preset.icon}</ThemedText>
                        <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                          {preset.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Name Input */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
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
                    placeholderTextColor={theme.textMuted}
                    accessibilityLabel="Account name"
                    editable={!isBusy}
                    className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-base"
                  />
                </View>

                {/* Balance Input */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    {editingAccount ? 'Current Balance' : 'Starting Balance'}
                  </ThemedText>
                  <View className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark flex-row items-center">
                    <ThemedText className="text-lg font-bold text-ledger-ink-muted dark:text-ledger-ink-dark-muted mr-2">
                      {DEFAULT_CURRENCY_SYMBOL}
                    </ThemedText>
                    <TextInput
                      value={balanceInput}
                      onChangeText={(text) => {
                        setBalanceInput(normalizeDecimalInput(text));
                        if (formError) setFormError(null);
                      }}
                      placeholder="0.00"
                      placeholderTextColor={theme.textMuted}
                      accessibilityLabel={editingAccount ? 'Current balance' : 'Starting balance'}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      editable={!isBusy}
                      style={TABULAR_NUMS_STYLE}
                      className="flex-1 h-full text-ledger-ink dark:text-ledger-ink-dark text-base font-bold"
                    />
                  </View>
                </View>

                {/* Icon Picker */}
                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
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
                              ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                              : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark active:opacity-75'
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
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
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
                              ? 'border-ledger-ink dark:border-ledger-ink-dark'
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
                <View className="gap-2.5 pt-3 border-t border-ledger-border dark:border-ledger-border-dark">
                  <Pressable
                    onPress={handleSave}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={editingAccount ? 'Save changes' : 'Save account'}
                    className={`min-h-[44px] py-3 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center ${
                      isBusy ? 'opacity-70' : ''
                    }`}
                  >
                    {upsertAccountMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <ThemedText className="text-sm font-bold text-ledger-canvas dark:text-brand-900">
                        {editingAccount ? 'Save Changes' : 'Save Account'}
                      </ThemedText>
                    )}
                  </Pressable>

                  <View className="flex-row gap-2.5">
                    {confirmingDelete && editingAccount ? (
                      <>
                        <Pressable
                          onPress={() => setConfirmingDelete(false)}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Keep account"
                          className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Keep Account
                          </ThemedText>
                        </Pressable>

                        <Pressable
                          onPress={handleDelete}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={`Confirm delete ${editingAccount.name}`}
                          className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center active:opacity-85"
                        >
                          {deleteAccountMutation.isPending ? (
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
                          onPress={handleCloseModal}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel"
                          className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>

                        {editingAccount ? (
                          <Pressable
                            onPress={() => setConfirmingDelete(true)}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${editingAccount.name}`}
                            className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                          >
                            <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
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
      </SafeAreaView>
    </View>
  );
}
