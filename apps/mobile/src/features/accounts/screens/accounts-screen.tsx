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
import { router } from 'expo-router';
import {
  ACCOUNT_TYPE_LABELS,
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  filterAccountsByListFilter,
  formatAccountLinkedErrorMessage,
  formatMinorUnits,
  getAccountLinkedRecords,
  isLiquidCashAccountType,
  minorUnitsToDecimalInput,
  normalizeDecimalInput,
  parseDecimalToMinorUnits,
  type Account,
  type AccountListFilter,
  type AccountsRouteTab,
  type AccountType,
} from '@repo/contracts';

import { AppIcon, type AppIconName } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import {
  useAccounts,
  useDeleteAccount,
  useIncomeSources,
  useRecurringCommitments,
  useSetAccountBalance,
  useTransactions,
  useUpsertAccount,
} from '@/features/transactions/hooks/use-transactions';
import { BackupDataModal } from '../components/backup-data-modal';
import { IncomeSourcesPanel } from '../components/income-sources-panel';

interface AccountTypeConfig {
  value: AccountType;
  label: string;
  tagLabel: string;
  iconName: AppIconName;
  defaultIcon: string;
  defaultColor: string;
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

const ACCOUNT_ICONS = ['🏦', '🏛️', '📱', '💚', '💳', '💵', '🪙', '🐷', '💎', '🌊'] as const;

const ACCOUNT_COLOR_OPTIONS = [
  { label: 'Forest Pine', value: '#1B4332' },
  { label: 'Sage Pine', value: '#1E6F4E' },
  { label: 'Deep Teal', value: '#2C5F6E' },
  { label: 'Warm Ochre', value: '#A16207' },
  { label: 'Terracotta', value: '#B4432C' },
  { label: 'Warm Charcoal', value: '#5C584F' },
] as const;

const FILTER_OPTIONS: readonly { key: AccountListFilter; label: string; iconName?: AppIconName }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'LIQUID_CASH', label: 'Liquid Cash', iconName: 'wallet' },
  { key: 'BANK', label: 'Bank', iconName: 'accounts' },
  { key: 'E_WALLET', label: 'E-Wallet', iconName: 'wallet' },
  { key: 'CASH', label: 'Cash', iconName: 'wallet' },
  { key: 'CREDIT_CARD', label: 'Credit Card', iconName: 'creditCard' },
];

function getTypeConfig(accountType: AccountType): AccountTypeConfig {
  return ACCOUNT_TYPE_CONFIG_MAP.get(accountType) ?? ACCOUNT_TYPE_OPTIONS[0];
}

function chunkIntoRows<T>(items: readonly T[], columns: number): T[][] {
  if (columns <= 1) {
    return items.map((item) => [item]);
  }
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

interface AccountCardProps {
  account: Account;
  onEdit: (account: Account) => void;
  onSetBalance: (account: Account) => void;
}

function AccountCard({ account, onEdit, onSetBalance }: AccountCardProps) {
  const formattedBalance = formatMinorUnits(account.balanceMinor, account.currency);
  const typeConfig = getTypeConfig(account.accountType);
  const isNegative = account.balanceMinor < 0;

  return (
    <View className="flex-1 justify-between p-4 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-3">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className="w-11 h-11 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center shrink-0">
            <ThemedText className="text-xl">{account.icon}</ThemedText>
          </View>

          <View className="flex-1 min-w-0 gap-0.5">
            <ThemedText
              className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
              numberOfLines={1}
            >
              {account.name}
            </ThemedText>

            <View className="flex-row items-center gap-1.5 flex-wrap">
              <View className="px-2 py-0.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                <ThemedText className="text-[11px] font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  {typeConfig.label}
                </ThemedText>
              </View>
              {account.accountType === 'CREDIT_CARD' && account.dueDay ? (
                <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                  Due day {account.dueDay}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </View>

        <View className="flex-row items-baseline justify-between gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
          <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
            Balance
          </ThemedText>
          <ThemedText
            numeric
            style={TABULAR_NUMS_STYLE}
            className={`text-lg font-extrabold ${
              isNegative
                ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                : 'text-ledger-ink dark:text-ledger-ink-dark'
            }`}
          >
            {formattedBalance}
          </ThemedText>
        </View>
      </View>

      <View className="flex-row gap-2 pt-1">
        <Pressable
          onPress={() => onSetBalance(account)}
          accessibilityRole="button"
          accessibilityLabel={`Set balance for ${account.name}`}
          className="flex-1 min-h-[44px] px-3 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center active:opacity-80"
        >
          <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
            Set Balance
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => onEdit(account)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${account.name}`}
          className="min-h-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
        >
          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
            Edit
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export interface AccountsScreenProps {
  initialTab?: AccountsRouteTab;
}

export function AccountsScreen({ initialTab = 'ACCOUNTS' }: AccountsScreenProps = {}) {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const { showSuccess } = useFeedback();
  const { width: windowWidth } = useWindowDimensions();

  const accountsQuery = useAccounts();
  const transactionsQuery = useTransactions();
  const commitmentsQuery = useRecurringCommitments();
  const incomeSourcesQuery = useIncomeSources();

  const upsertAccountMutation = useUpsertAccount();
  const setBalanceMutation = useSetAccountBalance();
  const deleteAccountMutation = useDeleteAccount();

  const [activeTab, setActiveTab] = useState<AccountsRouteTab>(initialTab);
  const [filter, setFilter] = useState<AccountListFilter>('ALL');
  const [backupModalOpen, setBackupModalOpen] = useState(false);

  // Set Balance modal state
  const [balanceAccount, setBalanceAccount] = useState<Account | null>(null);
  const [quickBalanceInput, setQuickBalanceInput] = useState('');
  const [quickBalanceError, setQuickBalanceError] = useState<string | null>(null);

  // Add/Edit Account modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('BANK');
  const [nameInput, setNameInput] = useState('');
  const [balanceInput, setBalanceInput] = useState('0');
  const [statementDayInput, setStatementDayInput] = useState('');
  const [dueDayInput, setDueDayInput] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🏦');
  const [selectedColor, setSelectedColor] = useState('#1B4332');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const modalScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const accounts = accountsQuery.data ?? [];
  const incomeSources = incomeSourcesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const recurringCommitments = commitmentsQuery.data ?? [];

  const liquidCashAccounts = useMemo(
    () => accounts.filter((a) => isLiquidCashAccountType(a.accountType)),
    [accounts],
  );
  const creditCardAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === 'CREDIT_CARD'),
    [accounts],
  );
  const liquidCashTotalMinor = useMemo(
    () => liquidCashAccounts.reduce((acc, a) => acc + a.balanceMinor, 0),
    [liquidCashAccounts],
  );
  const creditCardTotalMinor = useMemo(
    () => creditCardAccounts.reduce((acc, a) => acc + a.balanceMinor, 0),
    [creditCardAccounts],
  );

  const filteredAccounts = useMemo(
    () => filterAccountsByListFilter(accounts, filter),
    [accounts, filter],
  );

  const accountGridColumns = windowWidth >= 1024 ? 3 : windowWidth >= 640 ? 2 : 1;
  const accountRows = useMemo(
    () => chunkIntoRows(filteredAccounts, accountGridColumns),
    [filteredAccounts, accountGridColumns],
  );

  const editingLinkedRecords = useMemo(() => {
    if (!editingAccount) return null;
    return getAccountLinkedRecords(
      {
        transactions,
        recurringCommitments,
        incomeSources,
      },
      editingAccount.id,
    );
  }, [editingAccount, transactions, recurringCommitments, incomeSources]);

  const openAddModal = (presetType: AccountType = 'BANK') => {
    const config = getTypeConfig(presetType);
    setEditingAccount(null);
    setAccountType(presetType);
    setNameInput('');
    setBalanceInput('0');
    setStatementDayInput('');
    setDueDayInput('');
    setSelectedIcon(config.defaultIcon);
    setSelectedColor(config.defaultColor);
    setFormError(null);
    setConfirmingDelete(false);
    setModalVisible(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setAccountType(account.accountType);
    setNameInput(account.name);
    setBalanceInput(minorUnitsToDecimalInput(account.balanceMinor));
    setStatementDayInput(
      typeof account.statementDay === 'number' ? String(account.statementDay) : '',
    );
    setDueDayInput(typeof account.dueDay === 'number' ? String(account.dueDay) : '');
    setSelectedIcon(account.icon);
    setSelectedColor(account.color);
    setFormError(null);
    setConfirmingDelete(false);
    setModalVisible(true);
  };

  const handleOpenSetBalance = (account: Account) => {
    setBalanceAccount(account);
    setQuickBalanceInput(minorUnitsToDecimalInput(account.balanceMinor));
    setQuickBalanceError(null);
  };

  const handleConfirmSetBalance = async () => {
    if (!balanceAccount) return;
    const parsedMinor = parseDecimalToMinorUnits(quickBalanceInput);
    if (parsedMinor === null) {
      setQuickBalanceError('Enter a valid number (up to 2 decimal places).');
      return;
    }
    setQuickBalanceError(null);
    try {
      const updated = await setBalanceMutation.mutateAsync({
        accountId: balanceAccount.id,
        balanceMinor: parsedMinor,
      });
      setBalanceAccount(null);
      showSuccess(
        `Updated "${updated.name}" to ${formatMinorUnits(
          updated.balanceMinor,
          updated.currency,
        )}.`,
      );
    } catch (error: unknown) {
      setQuickBalanceError(
        getUserErrorMessage(error, 'Could not update balance.'),
      );
    }
  };

  const handleSaveAccount = async () => {
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setFormError('Please enter an account name.');
      return;
    }

    const parsedBalanceMinor = parseDecimalToMinorUnits(balanceInput);
    if (parsedBalanceMinor === null) {
      setFormError('Please enter a valid numeric balance.');
      return;
    }

    let statementDay: number | undefined;
    let dueDay: number | undefined;
    if (accountType === 'CREDIT_CARD') {
      if (statementDayInput.trim().length > 0) {
        const s = Number.parseInt(statementDayInput.trim(), 10);
        if (!Number.isInteger(s) || s < 1 || s > 31) {
          setFormError('Statement day must be between 1 and 31.');
          return;
        }
        statementDay = s;
      }
      if (dueDayInput.trim().length > 0) {
        const d = Number.parseInt(dueDayInput.trim(), 10);
        if (!Number.isInteger(d) || d < 1 || d > 31) {
          setFormError('Due day must be between 1 and 31.');
          return;
        }
        dueDay = d;
      }
    }

    setFormError(null);
    try {
      const saved = await upsertAccountMutation.mutateAsync({
        ...(editingAccount ? { id: editingAccount.id } : {}),
        name: trimmedName,
        accountType,
        icon: selectedIcon,
        color: selectedColor,
        currency: editingAccount?.currency ?? DEFAULT_CURRENCY,
        balanceMinor: parsedBalanceMinor,
        ...(statementDay !== undefined ? { statementDay } : {}),
        ...(dueDay !== undefined ? { dueDay } : {}),
      });
      setModalVisible(false);
      showSuccess(
        editingAccount
          ? `Saved changes to "${saved.name}".`
          : `Added account "${saved.name}".`,
      );
    } catch (error: unknown) {
      setFormError(
        getUserErrorMessage(error, 'Failed to save account. Please try again.'),
      );
    }
  };

  const handleDelete = async () => {
    if (!editingAccount) return;
    const deletedName = editingAccount.name;
    setFormError(null);
    try {
      await deleteAccountMutation.mutateAsync(editingAccount.id);
      setConfirmingDelete(false);
      setModalVisible(false);
      showSuccess(`Deleted account "${deletedName}".`);
    } catch (error: unknown) {
      setFormError(getUserErrorMessage(error, 'Could not delete this account.'));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const isBusy = upsertAccountMutation.isPending || deleteAccountMutation.isPending;
  const activeCreateType: AccountType =
    filter === 'ALL' || filter === 'LIQUID_CASH' ? 'BANK' : filter;

  return (
    <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
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
            <View className="flex-1 min-w-[180px] gap-0.5">
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
              >
                Accounts &amp; Paydays
              </ThemedText>
              <ThemedText className="text-sm text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Balances, credit cards, salary paydays, and backups
              </ThemedText>
            </View>

            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setBackupModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Backup and Data"
                className="min-h-[44px] px-3.5 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-1.5 active:opacity-75"
              >
                <AppIcon name="portability" size={15} color={theme.textSecondary} />
                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                  Backup
                </ThemedText>
              </Pressable>

              {activeTab === 'ACCOUNTS' && (
                <Pressable
                  onPress={() => openAddModal(activeCreateType)}
                  accessibilityRole="button"
                  accessibilityLabel="Add Account"
                  className="min-h-[44px] px-4 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 flex-row items-center justify-center gap-1.5"
                >
                  <AppIcon name="add" size={15} color={theme.onPrimary} />
                  <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                    Add Account
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </View>

          {/* 2-Tab Switcher: Accounts | Paydays */}
          <View
            accessibilityRole="tablist"
            className="flex-row p-1 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark gap-1"
          >
            <Pressable
              onPress={() => setActiveTab('ACCOUNTS')}
              accessibilityRole="tab"
              accessibilityLabel={`Accounts (${accounts.length})`}
              accessibilityState={{ selected: activeTab === 'ACCOUNTS' }}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl items-center justify-center ${
                activeTab === 'ACCOUNTS'
                  ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                  : 'border border-transparent active:opacity-75'
              }`}
            >
              <ThemedText
                numeric
                className={`text-xs sm:text-sm font-bold ${
                  activeTab === 'ACCOUNTS'
                    ? 'text-ledger-ink dark:text-ledger-ink-dark'
                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                }`}
              >
                {`Accounts (${accounts.length})`}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('PAYDAYS')}
              accessibilityRole="tab"
              accessibilityLabel={`Paydays (${incomeSources.length})`}
              accessibilityState={{ selected: activeTab === 'PAYDAYS' }}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl items-center justify-center ${
                activeTab === 'PAYDAYS'
                  ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                  : 'border border-transparent active:opacity-75'
              }`}
            >
              <ThemedText
                numeric
                className={`text-xs sm:text-sm font-bold ${
                  activeTab === 'PAYDAYS'
                    ? 'text-ledger-ink dark:text-ledger-ink-dark'
                    : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                }`}
              >
                {`Paydays (${incomeSources.length})`}
              </ThemedText>
            </Pressable>
          </View>

          {activeTab === 'PAYDAYS' ? (
            <IncomeSourcesPanel />
          ) : (
            <>
              {/* Liquid vs Credit Card Totals Strip */}
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() => setFilter('LIQUID_CASH')}
                  accessibilityRole="button"
                  accessibilityLabel="Filter Liquid Cash"
                  className="flex-1 p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-0.5"
                >
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Liquid Cash
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className="text-base sm:text-xl font-extrabold text-ledger-pine dark:text-ledger-pine-dark"
                  >
                    {formatMinorUnits(liquidCashTotalMinor)}
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {liquidCashAccounts.length}{' '}
                    {liquidCashAccounts.length === 1 ? 'account' : 'accounts'}
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => setFilter('CREDIT_CARD')}
                  accessibilityRole="button"
                  accessibilityLabel="Filter Credit Cards"
                  className="flex-1 p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark gap-0.5"
                >
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Credit Card Balances
                  </ThemedText>
                  <ThemedText
                    numeric
                    style={TABULAR_NUMS_STYLE}
                    className={`text-base sm:text-xl font-extrabold ${
                      creditCardTotalMinor < 0
                        ? 'text-ledger-terracotta dark:text-ledger-terracotta-dark'
                        : 'text-ledger-ink dark:text-ledger-ink-dark'
                    }`}
                  >
                    {formatMinorUnits(creditCardTotalMinor)}
                  </ThemedText>
                  <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    {creditCardAccounts.length}{' '}
                    {creditCardAccounts.length === 1 ? 'card' : 'cards'}
                  </ThemedText>
                </Pressable>
              </View>

              {/* Filter Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 py-0.5"
              >
                {FILTER_OPTIONS.map((option) => {
                  const isSelected = filter === option.key;
                  const count = filterAccountsByListFilter(accounts, option.key).length;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setFilter(option.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter ${option.label}`}
                      accessibilityState={{ selected: isSelected }}
                      className={`min-h-[44px] px-4 py-2 rounded-full flex-row items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                          : 'bg-ledger-surface dark:bg-ledger-surface-dark border-ledger-border dark:border-ledger-border-dark'
                      }`}
                    >
                      {option.iconName ? (
                        <AppIcon
                          name={option.iconName}
                          size={14}
                          color={isSelected ? theme.primary : theme.textSecondary}
                        />
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

              {/* Accounts Grid */}
              <View className="gap-3">
                {accountRows.map((row, rowIndex) => (
                  <View key={`row-${rowIndex}`} className="flex-row items-stretch gap-3">
                    {row.map((account) => (
                      <View key={account.id} className="flex-1 min-w-0">
                        <AccountCard
                          account={account}
                          onEdit={openEditModal}
                          onSetBalance={handleOpenSetBalance}
                        />
                      </View>
                    ))}
                    {Array.from({ length: accountGridColumns - row.length }).map(
                      (_, spacerIndex) => (
                        <View
                          key={`spacer-${rowIndex}-${spacerIndex}`}
                          className="flex-1 min-w-0"
                        />
                      ),
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        {/* Quick Set Balance Modal */}
        <Modal
          visible={balanceAccount !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!setBalanceMutation.isPending) setBalanceAccount(null);
          }}
        >
          <SafeAreaView
            className="flex-1 bg-black/50"
            edges={['top', 'bottom', 'left', 'right']}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
              className="flex-1 items-center justify-center p-4"
            >
              <Pressable
                onPress={() => {
                  if (!setBalanceMutation.isPending) setBalanceAccount(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                className="absolute inset-0"
              />
              <View className="relative z-10 w-full max-w-[400px] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-5 gap-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <ThemedText className="text-lg font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Set Balance
                    </ThemedText>
                    <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      {balanceAccount?.name}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => setBalanceAccount(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close dialog"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                  >
                    <AppIcon name="close" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>

                {quickBalanceError ? (
                  <ThemedText
                    accessibilityRole="alert"
                    className="text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark"
                  >
                    {quickBalanceError}
                  </ThemedText>
                ) : null}

                <View className="gap-1.5">
                  <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                    Exact Actual Balance ({balanceAccount?.currency ?? DEFAULT_CURRENCY})
                  </ThemedText>
                  <TextInput
                    value={quickBalanceInput}
                    onChangeText={(text) => setQuickBalanceInput(normalizeDecimalInput(text))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                    style={TABULAR_NUMS_STYLE}
                    className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-base font-bold text-ledger-ink dark:text-ledger-ink-dark"
                  />
                  {balanceAccount?.accountType === 'CREDIT_CARD' ? (
                    <ThemedText className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Enter negative amount (e.g. -5200) for owed card balance, or 0 if paid off.
                    </ThemedText>
                  ) : null}
                </View>

                <View className="flex-row gap-2.5">
                  <Pressable
                    onPress={() => setBalanceAccount(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    className="flex-1 min-h-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleConfirmSetBalance()}
                    disabled={setBalanceMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Save Balance"
                    className="flex-1 min-h-[44px] rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center"
                  >
                    {setBalanceMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : (
                      <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                        Update Balance
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Add / Edit Account Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!isBusy) setModalVisible(false);
          }}
        >
          <SafeAreaView
            className="flex-1 bg-black/50"
            edges={['top', 'bottom', 'left', 'right']}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
              className="flex-1 items-center justify-center p-4"
            >
              <Pressable
                onPress={() => {
                  if (!isBusy) setModalVisible(false);
                }}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Close dialog backdrop"
                className="absolute inset-0"
              />
              <View className="relative z-10 w-full max-w-[480px] max-h-[90%] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
                <ScrollView
                  ref={modalScrollRef}
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
                        Bank, E-Wallet, Cash, or Credit Card
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => setModalVisible(false)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Close dialog"
                      className="min-w-[44px] min-h-[44px] rounded-xl items-center justify-center bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark"
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
                            onPress={() => {
                              setAccountType(option.value);
                              if (!editingAccount) {
                                setSelectedIcon(option.defaultIcon);
                                setSelectedColor(option.defaultColor);
                              }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={option.tagLabel}
                            accessibilityState={{ selected: isSelected }}
                            className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-500 dark:border-brand-400'
                                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
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

                  <View className="gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Account Name
                    </ThemedText>
                    <TextInput
                      value={nameInput}
                      onChangeText={setNameInput}
                      placeholder={
                        accountType === 'CREDIT_CARD'
                          ? 'e.g. BPI Credit Card'
                          : 'e.g. BPI Payroll, GCash, Cash'
                      }
                      placeholderTextColor={theme.textMuted}
                      editable={!isBusy}
                      className="h-12 px-4 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-ledger-ink dark:text-ledger-ink-dark text-base"
                    />
                  </View>

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
                        onChangeText={(text) => setBalanceInput(normalizeDecimalInput(text))}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        editable={!isBusy}
                        style={TABULAR_NUMS_STYLE}
                        className="flex-1 h-full text-ledger-ink dark:text-ledger-ink-dark text-base font-bold"
                      />
                    </View>
                  </View>

                  {accountType === 'CREDIT_CARD' && (
                    <View className="flex-row gap-3">
                      <View className="flex-1 gap-1.5">
                        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                          Statement Day (1–31)
                        </ThemedText>
                        <TextInput
                          value={statementDayInput}
                          onChangeText={(t) => setStatementDayInput(t.replace(/[^0-9]/g, ''))}
                          placeholder="e.g. 5"
                          placeholderTextColor={theme.textMuted}
                          keyboardType="number-pad"
                          maxLength={2}
                          style={TABULAR_NUMS_STYLE}
                          className="h-11 px-3.5 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        />
                      </View>
                      <View className="flex-1 gap-1.5">
                        <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                          Due Day (1–31)
                        </ThemedText>
                        <TextInput
                          value={dueDayInput}
                          onChangeText={(t) => setDueDayInput(t.replace(/[^0-9]/g, ''))}
                          placeholder="e.g. 25"
                          placeholderTextColor={theme.textMuted}
                          keyboardType="number-pad"
                          maxLength={2}
                          style={TABULAR_NUMS_STYLE}
                          className="h-11 px-3.5 rounded-xl bg-ledger-canvas dark:bg-ledger-subtle-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                        />
                      </View>
                    </View>
                  )}

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
                                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
                            }`}
                          >
                            <ThemedText className="text-lg">{icon}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Color Swatches */}
                  <View className="gap-1.5">
                    <ThemedText className="text-[11px] font-semibold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Color
                    </ThemedText>
                    <View className="flex-row flex-wrap gap-2">
                      {ACCOUNT_COLOR_OPTIONS.map((swatch) => {
                        const isSelected = selectedColor === swatch.value;
                        return (
                          <Pressable
                            key={swatch.value}
                            onPress={() => setSelectedColor(swatch.value)}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${swatch.label}`}
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

                  <View className="gap-2.5 pt-3 border-t border-ledger-border dark:border-ledger-border-dark">
                    <Pressable
                      onPress={() => void handleSaveAccount()}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel="Save account"
                      className="min-h-[44px] py-3 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center"
                    >
                      {upsertAccountMutation.isPending ? (
                        <ActivityIndicator size="small" color={theme.onPrimary} />
                      ) : (
                        <ThemedText className="text-sm font-bold text-ledger-canvas dark:text-brand-900">
                          {editingAccount ? 'Save Changes' : 'Save Account'}
                        </ThemedText>
                      )}
                    </Pressable>

                    {confirmingDelete && editingAccount ? (
                      editingLinkedRecords?.isLinked ? (
                        <View className="p-3.5 rounded-2xl bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft border border-ledger-border dark:border-ledger-border-dark gap-2.5">
                          <ThemedText className="text-xs font-semibold text-ledger-ochre dark:text-ledger-ochre-dark">
                            {formatAccountLinkedErrorMessage(editingLinkedRecords)}
                          </ThemedText>
                          <View className="gap-2">
                            {editingLinkedRecords.transactions.length > 0 ? (
                              <Pressable
                                onPress={() => {
                                  setConfirmingDelete(false);
                                  setModalVisible(false);
                                  router.push({
                                    pathname: '/transactions',
                                    params: { accountId: editingAccount.id },
                                  });
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="View linked transactions"
                                className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                              >
                                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                                  View Linked Entries ({editingLinkedRecords.transactions.length})
                                </ThemedText>
                              </Pressable>
                            ) : null}

                            {editingLinkedRecords.recurringCommitments.length > 0 ? (
                              <Pressable
                                onPress={() => {
                                  setConfirmingDelete(false);
                                  setModalVisible(false);
                                  router.push('/debts');
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="View linked debts or bills"
                                className="min-h-[44px] px-3 py-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                              >
                                <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                                  View Linked Debts &amp; Bills ({editingLinkedRecords.recurringCommitments.length})
                                </ThemedText>
                              </Pressable>
                            ) : null}

                            <Pressable
                              onPress={() => setConfirmingDelete(false)}
                              accessibilityRole="button"
                              accessibilityLabel="Keep account"
                              className="min-h-[44px] py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                            >
                              <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                                Keep Account
                              </ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <View className="flex-row gap-2.5">
                          <Pressable
                            onPress={() => setConfirmingDelete(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Keep account"
                            className="flex-1 min-h-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                          >
                            <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                              Keep Account
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() => void handleDelete()}
                            disabled={isBusy}
                            accessibilityRole="button"
                            accessibilityLabel={`Confirm delete ${editingAccount.name}`}
                            className="flex-1 min-h-[44px] rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center"
                          >
                            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                              Confirm Delete
                            </ThemedText>
                          </Pressable>
                        </View>
                      )
                    ) : (
                      <View className="flex-row gap-2.5">
                        <Pressable
                          onPress={() => setModalVisible(false)}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel"
                          className="flex-1 min-h-[44px] rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                        >
                          <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                            Cancel
                          </ThemedText>
                        </Pressable>
                        {editingAccount ? (
                          <Pressable
                            onPress={() => setConfirmingDelete(true)}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${editingAccount.name}`}
                            className="flex-1 min-h-[44px] rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center justify-center"
                          >
                            <ThemedText className="text-xs font-bold text-ledger-terracotta dark:text-ledger-terracotta-dark">
                              Delete
                            </ThemedText>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        <BackupDataModal
          visible={backupModalOpen}
          onClose={() => setBackupModalOpen(false)}
        />
      </SafeAreaView>
    </View>
  );
}
