import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  formatMinorUnits,
  type TransactionType,
  type Wallet,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';

export interface WalletSelectorProps {
  type: TransactionType;
  wallets: readonly Wallet[];
  selectedWalletId: string;
  selectedToWalletId?: string;
  onSelectWallet: (walletId: string) => void;
  onSelectToWallet: (walletId: string) => void;
}

interface WalletChipProps {
  wallet: Wallet;
  isSelected: boolean;
  onPress: () => void;
  roleLabel?: string;
}

function WalletChip({ wallet, isSelected, onPress, roleLabel }: WalletChipProps) {
  const formattedBalance = formatMinorUnits(wallet.balanceMinor, wallet.currency);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${roleLabel ? `${roleLabel}: ` : ''}${wallet.name}, balance ${formattedBalance}`}
      onPress={onPress}
      className={`min-w-[124px] px-3.5 py-2.5 rounded-2xl border justify-center active:scale-95 transition-all ${
        isSelected
          ? 'border-2'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}
      style={
        isSelected
          ? {
              backgroundColor: `${wallet.color}15`,
              borderColor: wallet.color,
            }
          : undefined
      }
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <ThemedText className="text-xl">{wallet.icon}</ThemedText>
        {isSelected && (
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: wallet.color }}
          />
        )}
      </View>
      <ThemedText
        className={`text-sm mb-0.5 ${
          isSelected
            ? 'font-bold'
            : 'font-semibold text-slate-800 dark:text-slate-100'
        }`}
        style={isSelected ? { color: wallet.color } : undefined}
        numberOfLines={1}
      >
        {wallet.name}
      </ThemedText>
      <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {formattedBalance}
      </ThemedText>
    </Pressable>
  );
}

export function WalletSelector({
  type,
  wallets,
  selectedWalletId,
  selectedToWalletId,
  onSelectWallet,
  onSelectToWallet,
}: WalletSelectorProps) {
  if (wallets.length === 0) {
    return (
      <View className="p-4 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <ThemedText className="text-sm text-slate-400 dark:text-slate-500">
          No wallets available
        </ThemedText>
      </View>
    );
  }

  if (type === 'TRANSFER') {
    const fromWallet = wallets.find((w) => w.id === selectedWalletId);
    const toWallet = wallets.find((w) => w.id === selectedToWalletId);
    const isConflict = Boolean(
      selectedToWalletId && selectedWalletId === selectedToWalletId,
    );
    const canSwap = Boolean(
      selectedToWalletId && selectedWalletId && selectedWalletId !== selectedToWalletId,
    );

    const handleSelectFrom = (walletId: string) => {
      if (walletId === selectedToWalletId) {
        const alternative = wallets.find((w) => w.id !== walletId);
        if (alternative) {
          onSelectToWallet(alternative.id);
        }
      }
      onSelectWallet(walletId);
    };

    const handleSelectTo = (walletId: string) => {
      if (walletId === selectedWalletId) {
        const alternative = wallets.find((w) => w.id !== walletId);
        if (alternative) {
          onSelectWallet(alternative.id);
        }
      }
      onSelectToWallet(walletId);
    };

    const handleSwap = () => {
      if (canSwap && selectedToWalletId) {
        const prevFrom = selectedWalletId;
        const prevTo = selectedToWalletId;
        onSelectWallet(prevTo);
        onSelectToWallet(prevFrom);
      }
    };

    return (
      <View className="w-full">
        {/* Transfer Header Card */}
        <View
          className={`p-3.5 rounded-2xl bg-white dark:bg-slate-900 border mb-3 ${
            isConflict
              ? 'border-rose-500 dark:border-rose-500'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                From
              </ThemedText>
              <ThemedText className="text-sm font-bold text-slate-900 dark:text-slate-100" numberOfLines={1}>
                {fromWallet ? `${fromWallet.icon} ${fromWallet.name}` : 'Select wallet'}
              </ThemedText>
            </View>

            <View className="items-center justify-center px-3">
              <ThemedText className="text-lg font-bold text-brand-500">
                →
              </ThemedText>
              {canSwap && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Swap from and to wallets"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={handleSwap}
                  className="mt-1 min-h-[44px] min-w-[44px] px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center active:scale-95"
                >
                  <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                    Swap ⇄
                  </ThemedText>
                </Pressable>
              )}
            </View>

            <View className="flex-1 items-end">
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                To
              </ThemedText>
              <ThemedText className="text-sm font-bold text-slate-900 dark:text-slate-100" numberOfLines={1}>
                {toWallet ? `${toWallet.icon} ${toWallet.name}` : 'Select wallet'}
              </ThemedText>
            </View>
          </View>
        </View>

        {isConflict && (
          <View className="mb-3 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60">
            <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              Destination wallet must differ from source wallet
            </ThemedText>
          </View>
        )}

        {/* Section 1: From Wallet */}
        <View className="mb-2">
          <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
            From Wallet
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2.5 py-0.5"
          >
            {wallets.map((wallet) => (
              <WalletChip
                key={`from-${wallet.id}`}
                wallet={wallet}
                isSelected={wallet.id === selectedWalletId}
                onPress={() => handleSelectFrom(wallet.id)}
                roleLabel="Source"
              />
            ))}
          </ScrollView>
        </View>

        {/* Swap Button Between Pickers */}
        <View className="flex-row items-center justify-center my-1 z-10">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap from and to wallets"
            onPress={handleSwap}
            disabled={!canSwap}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-xs active:scale-95 transition-all ${
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
              className={`text-xs font-semibold ${
                canSwap ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              Swap Accounts
            </ThemedText>
          </Pressable>
        </View>

        {/* Section 2: To Wallet */}
        <View>
          <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
            To Wallet
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2.5 py-0.5"
          >
            {wallets.map((wallet) => (
              <WalletChip
                key={`to-${wallet.id}`}
                wallet={wallet}
                isSelected={wallet.id === selectedToWalletId}
                onPress={() => handleSelectTo(wallet.id)}
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
      <View className="px-1 mb-2">
        <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Wallet
        </ThemedText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2.5 py-0.5"
      >
        {wallets.map((wallet) => (
          <WalletChip
            key={wallet.id}
            wallet={wallet}
            isSelected={wallet.id === selectedWalletId}
            onPress={() => onSelectWallet(wallet.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
