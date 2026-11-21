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
import { ThemedText } from '@/common/components/themed-text';

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
    bg: 'bg-brand-100/80 dark:bg-brand-950/60',
    text: 'text-brand-700 dark:text-brand-300',
  },
  E_WALLET: {
    bg: 'bg-emerald-100/80 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  CASH: {
    bg: 'bg-amber-100/80 dark:bg-amber-950/60',
    text: 'text-amber-700 dark:text-amber-300',
  },
  CREDIT_CARD: {
    bg: 'bg-violet-100/80 dark:bg-violet-950/60',
    text: 'text-violet-700 dark:text-violet-300',
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
          : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80'
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
        className="w-9 h-9 rounded-xl items-center justify-center shrink-0 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/70"
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
                : 'font-semibold text-slate-800 dark:text-slate-100'
            }`}
            style={isSelected ? { color: account.color } : undefined}
            numberOfLines={1}
          >
            {account.name}
          </ThemedText>
          <View className={`px-1.5 py-0.5 rounded-md ${tagStyle.bg}`}>
            <ThemedText className={`text-[9px] font-bold uppercase ${tagStyle.text}`}>
              {typeLabel}
            </ThemedText>
          </View>
        </View>
        <ThemedText
          className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 mt-0.5"
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
  if (accounts.length === 0) {
    return (
      <View className="p-4 items-center justify-center gap-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700">
        <ThemedText className="text-sm font-medium text-slate-500 dark:text-slate-400 text-center">
          No accounts available
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Account"
          onPress={() => router.push('/accounts')}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-brand-500 active:bg-brand-600 items-center justify-center"
        >
          <ThemedText className="text-xs font-bold text-white">
            + Add Account
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
          className={`p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border ${
            isConflict
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200/80 dark:border-slate-700/80'
          }`}
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1 min-w-0">
              <ThemedText className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                From
              </ThemedText>
              <ThemedText
                className="text-sm font-bold text-slate-900 dark:text-slate-100"
                numberOfLines={1}
              >
                {fromAccount ? `${fromAccount.icon} ${fromAccount.name}` : 'Select account'}
              </ThemedText>
            </View>

            <View className="px-2 items-center justify-center">
              <ThemedText className="text-base font-extrabold text-brand-500">
                →
              </ThemedText>
            </View>

            <View className="flex-1 min-w-0 items-end">
              <ThemedText className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                To
              </ThemedText>
              <ThemedText
                className="text-sm font-bold text-slate-900 dark:text-slate-100"
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
            className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60"
          >
            <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              ⚠️ Destination account must differ from source account
            </ThemedText>
          </View>
        )}

        {/* From Account */}
        <View>
          <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 px-0.5">
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
                ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-200 dark:border-brand-800'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-50'
            }`}
          >
            <ThemedText
              className={`text-sm font-bold ${
                canSwap ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              ⇄
            </ThemedText>
            <ThemedText
              className={`text-xs font-bold ${
                canSwap ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              Swap Accounts
            </ThemedText>
          </Pressable>
        </View>

        {/* To Account */}
        <View>
          <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 px-0.5">
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
        <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
