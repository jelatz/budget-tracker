import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  formatMinorUnits,
  getAccountTypeLabel,
  type Account,
  type AccountType,
  type TransactionType,
} from '@repo/contracts';
import { AppIcon } from '@/common/components/app-icon';
import { ThemedText } from '@/common/components/themed-text';
import { useTheme } from '@/common/hooks/use-theme';

export interface AccountSelectorProps {
  type: TransactionType;
  accounts: readonly Account[];
  selectedAccountId: string;
  selectedToAccountId?: string;
  onSelectAccount: (accountId: string) => void;
  onSelectToAccount: (accountId: string) => void;
}

const ACCOUNT_TAG_STYLES: Record<AccountType, { bg: string; text: string }> = {
  BANK: {
    bg: 'bg-brand-50 dark:bg-ledger-pine-dark-soft',
    text: 'text-brand-500 dark:text-brand-400',
  },
  E_WALLET: {
    bg: 'bg-ledger-pine-soft dark:bg-ledger-pine-dark-soft',
    text: 'text-ledger-pine dark:text-ledger-pine-dark',
  },
  CASH: {
    bg: 'bg-ledger-ochre-soft dark:bg-ledger-ochre-dark-soft',
    text: 'text-ledger-ochre dark:text-ledger-ochre-dark',
  },
  CREDIT_CARD: {
    bg: 'bg-ledger-teal-soft dark:bg-ledger-teal-dark-soft',
    text: 'text-ledger-teal dark:text-ledger-teal-dark',
  },
};

interface AccountChipProps {
  account: Account;
  isSelected: boolean;
  onPress: () => void;
  roleLabel?: string;
}

function AccountChip({ account, isSelected, onPress, roleLabel }: AccountChipProps) {
  const formattedBalance = formatMinorUnits(account.balanceMinor, account.currency);
  const typeLabel = getAccountTypeLabel(account.accountType);
  const tagStyle = ACCOUNT_TAG_STYLES[account.accountType];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${roleLabel ? `${roleLabel}: ` : ''}${account.name}, ${typeLabel}, balance ${formattedBalance}`}
      onPress={onPress}
      className={`min-h-[56px] min-w-[160px] px-3 py-2 rounded-2xl border flex-row items-center gap-2.5 active:scale-95 ${
        isSelected
          ? 'border-2'
          : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark'
      }`}
      style={
        isSelected
          ? {
              backgroundColor: `${account.color}15`,
              borderColor: account.color,
            }
          : undefined
      }
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center shrink-0 bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark"
        style={
          isSelected
            ? {
                backgroundColor: `${account.color}22`,
                borderColor: `${account.color}55`,
              }
            : undefined
        }
      >
        <ThemedText className="text-lg">{account.icon}</ThemedText>
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-1.5">
          <ThemedText
            className={`text-xs flex-1 ${
              isSelected
                ? 'font-bold'
                : 'font-semibold text-ledger-ink dark:text-ledger-ink-dark'
            }`}
            style={isSelected ? { color: account.color } : undefined}
            numberOfLines={1}
          >
            {account.name}
          </ThemedText>
          <View className={`px-1.5 py-0.5 rounded-md ${tagStyle.bg}`}>
            <ThemedText className={`text-[10px] font-bold ${tagStyle.text}`}>
              {typeLabel}
            </ThemedText>
          </View>
        </View>
        <ThemedText
          numeric
          className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5"
          numberOfLines={1}
        >
          {formattedBalance}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function AccountSelector({
  type,
  accounts,
  selectedAccountId,
  selectedToAccountId,
  onSelectAccount,
  onSelectToAccount,
}: AccountSelectorProps) {
  const theme = useTheme();

  if (accounts.length === 0) {
    return (
      <View className="p-4 items-center justify-center gap-2.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-dashed border-ledger-border-strong dark:border-ledger-border-strong-dark">
        <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
          No accounts available
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Account"
          onPress={() => router.push('/accounts')}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 dark:bg-brand-400 flex-row items-center justify-center gap-1.5 active:opacity-85"
        >
          <AppIcon name="add" size={14} color={theme.onPrimary} />
          <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
            Add Account
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  if (type === 'TRANSFER') {
    const fromAccount = accounts.find((a) => a.id === selectedAccountId);
    const toAccount = accounts.find((a) => a.id === selectedToAccountId);
    const isConflict = Boolean(
      selectedToAccountId && selectedAccountId === selectedToAccountId,
    );
    const canSwap = Boolean(
      selectedToAccountId && selectedAccountId && selectedAccountId !== selectedToAccountId,
    );

    const handleSelectFrom = (accountId: string) => {
      if (accountId === selectedToAccountId) {
        const alternative = accounts.find((a) => a.id !== accountId);
        if (alternative) {
          onSelectToAccount(alternative.id);
        }
      }
      onSelectAccount(accountId);
    };

    const handleSelectTo = (accountId: string) => {
      if (accountId === selectedAccountId) {
        const alternative = accounts.find((a) => a.id !== accountId);
        if (alternative) {
          onSelectAccount(alternative.id);
        }
      }
      onSelectToAccount(accountId);
    };

    const handleSwap = () => {
      if (canSwap && selectedToAccountId) {
        const prevFrom = selectedAccountId;
        const prevTo = selectedToAccountId;
        onSelectAccount(prevTo);
        onSelectToAccount(prevFrom);
      }
    };

    return (
      <View className="w-full gap-2.5">
        {/* Transfer Summary Card */}
        <View
          className={`p-3 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border ${
            isConflict
              ? 'border-ledger-terracotta dark:border-ledger-terracotta-dark'
              : 'border-ledger-border dark:border-ledger-border-dark'
          }`}
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 min-w-0">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-0.5">
                From
              </ThemedText>
              <ThemedText
                className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                numberOfLines={1}
              >
                {fromAccount ? `${fromAccount.icon} ${fromAccount.name}` : 'Select account'}
              </ThemedText>
            </View>

            <View className="px-2 items-center justify-center">
              <AppIcon name="arrowRight" size={16} color={theme.info} />
            </View>

            <View className="flex-1 min-w-0 items-end">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-0.5">
                To
              </ThemedText>
              <ThemedText
                className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark"
                numberOfLines={1}
              >
                {toAccount ? `${toAccount.icon} ${toAccount.name}` : 'Select account'}
              </ThemedText>
            </View>
          </View>
        </View>

        {isConflict && (
          <View
            accessibilityRole="alert"
            className="px-3.5 py-2.5 rounded-xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2"
          >
            <AppIcon name="warning" size={15} color={theme.negative} />
            <ThemedText className="flex-1 text-xs font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark">
              Destination account must differ from source account
            </ThemedText>
          </View>
        )}

        {/* From Account */}
        <View>
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-1.5 px-0.5">
            From Account
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 py-0.5"
          >
            {accounts.map((account) => (
              <AccountChip
                key={`from-${account.id}`}
                account={account}
                isSelected={account.id === selectedAccountId}
                onPress={() => handleSelectFrom(account.id)}
                roleLabel="Source"
              />
            ))}
          </ScrollView>
        </View>

        {/* Single Centered Swap Control */}
        <View className="flex-row items-center justify-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap from and to accounts"
            onPress={handleSwap}
            disabled={!canSwap}
            className={`min-h-[44px] flex-row items-center gap-1.5 px-4 py-2 rounded-full border active:scale-95 ${
              canSwap
                ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border-brand-200 dark:border-ledger-border-dark'
                : 'bg-ledger-subtle dark:bg-ledger-subtle-dark border-ledger-border dark:border-ledger-border-dark opacity-50'
            }`}
          >
            <AppIcon
              name="transfer"
              size={15}
              color={canSwap ? theme.primary : theme.textMuted}
            />
            <ThemedText
              className={`text-xs font-bold ${
                canSwap
                  ? 'text-brand-500 dark:text-brand-400'
                  : 'text-ledger-ink-muted dark:text-ledger-ink-dark-muted'
              }`}
            >
              Swap Accounts
            </ThemedText>
          </Pressable>
        </View>

        {/* To Account */}
        <View>
          <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted mb-1.5 px-0.5">
            To Account
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 py-0.5"
          >
            {accounts.map((account) => (
              <AccountChip
                key={`to-${account.id}`}
                account={account}
                isSelected={account.id === selectedToAccountId}
                onPress={() => handleSelectTo(account.id)}
                roleLabel="Destination"
              />
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  // EXPENSE or INCOME mode
  return (
    <View className="w-full">
      <View className="px-0.5 mb-1.5">
        <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
          Account
        </ThemedText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 py-0.5"
      >
        {accounts.map((account) => (
          <AccountChip
            key={account.id}
            account={account}
            isSelected={account.id === selectedAccountId}
            onPress={() => onSelectAccount(account.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
