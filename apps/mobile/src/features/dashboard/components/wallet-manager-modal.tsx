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
import {
  formatMinorUnits,
  isWalletLiquidForSafeToSpend,
  minorUnitsToDecimalInput,
  parseDecimalToMinorUnits,
  type Wallet,
  type WalletType,
} from '@repo/contracts';
import { ThemedText } from '@/common/components/themed-text';
import { confirmAction } from '@/common/lib/confirm';
import {
  useCreateWallet,
  useDeleteWallet,
  useUpdateWallet,
} from '@/features/transactions/hooks/use-transactions';

export interface WalletManagerModalProps {
  visible: boolean;
  editingWallet: Wallet | null;
  onClose: () => void;
}

const WALLET_TYPE_OPTIONS: Array<{
  type: WalletType;
  label: string;
  defaultIcon: string;
  defaultLiquid: boolean;
}> = [
  { type: 'CHECKING', label: 'Checking / Bank', defaultIcon: '🏦', defaultLiquid: true },
  { type: 'EWALLET', label: 'E-Wallet', defaultIcon: '📱', defaultLiquid: true },
  { type: 'CASH', label: 'Cash', defaultIcon: '💵', defaultLiquid: true },
  { type: 'SAVINGS', label: 'Savings', defaultIcon: '🐷', defaultLiquid: false },
  { type: 'CREDIT_CARD', label: 'Credit Card', defaultIcon: '💳', defaultLiquid: false },
];

const WALLET_ICONS = ['🏦', '💳', '💵', '🐷', '📱', '💼', '🪙'];
const WALLET_COLORS = [
  '#208AEF',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#06B6D4',
  '#64748B',
];

export function WalletManagerModal({
  visible,
  editingWallet,
  onClose,
}: WalletManagerModalProps) {
  const createWalletMutation = useCreateWallet();
  const updateWalletMutation = useUpdateWallet();
  const deleteWalletMutation = useDeleteWallet();

  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('CHECKING');
  const [icon, setIcon] = useState('🏦');
  const [color, setColor] = useState('#208AEF');
  const [balanceInput, setBalanceInput] = useState('0');
  const [includeInSafeToSpend, setIncludeInSafeToSpend] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy =
    createWalletMutation.isPending ||
    updateWalletMutation.isPending ||
    deleteWalletMutation.isPending;

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (editingWallet) {
      const initialOpening =
        editingWallet.openingBalanceMinor ?? editingWallet.balanceMinor;
      setName(editingWallet.name);
      setType(editingWallet.type);
      setIcon(editingWallet.icon);
      setColor(editingWallet.color);
      setBalanceInput(minorUnitsToDecimalInput(initialOpening));
      setIncludeInSafeToSpend(isWalletLiquidForSafeToSpend(editingWallet));
    } else {
      setName('');
      setType('CHECKING');
      setIcon('🏦');
      setColor('#208AEF');
      setBalanceInput('0');
      setIncludeInSafeToSpend(true);
    }
    setFormError(null);
  }, [visible, editingWallet]);

  const handleSelectType = (nextType: WalletType) => {
    setType(nextType);
    const meta = WALLET_TYPE_OPTIONS.find((opt) => opt.type === nextType);
    if (!editingWallet && meta) {
      setIcon(meta.defaultIcon);
      setIncludeInSafeToSpend(meta.defaultLiquid);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Please enter a wallet name.');
      return;
    }

    const openingBalanceMinor = parseDecimalToMinorUnits(balanceInput);
    if (openingBalanceMinor === null) {
      setFormError('Please enter a valid opening balance (up to 2 decimals).');
      return;
    }

    setFormError(null);

    try {
      if (editingWallet) {
        await updateWalletMutation.mutateAsync({
          id: editingWallet.id,
          input: {
            name: trimmedName,
            type,
            icon,
            color,
            openingBalanceMinor,
            includeInSafeToSpend,
          },
        });
      } else {
        await createWalletMutation.mutateAsync({
          name: trimmedName,
          type,
          icon,
          color,
          currency: 'PHP',
          openingBalanceMinor,
          balanceMinor: openingBalanceMinor,
          includeInSafeToSpend,
        });
      }
      onClose();
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Failed to save wallet.',
      );
    }
  };

  const handleDelete = async () => {
    if (!editingWallet || isBusy) {
      return;
    }

    const confirmed = await confirmAction({
      title: 'Delete Wallet',
      message: `Are you sure you want to delete "${editingWallet.name}"?`,
      confirmLabel: 'Delete',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    setFormError(null);
    try {
      await deleteWalletMutation.mutateAsync(editingWallet.id);
      onClose();
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'Failed to delete wallet.',
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!isBusy) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end sm:justify-center items-center bg-black/60 sm:p-4"
      >
        <Pressable
          className="absolute inset-0"
          onPress={() => {
            if (!isBusy) onClose();
          }}
          accessibilityLabel="Dismiss wallet modal"
        />

        <View className="w-full sm:max-w-[480px] max-h-[90%] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#131b2e] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl gap-4">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <View>
              <ThemedText className="text-lg font-bold text-slate-900 dark:text-white">
                {editingWallet ? 'Edit Wallet' : 'New Wallet'}
              </ThemedText>
              <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                {editingWallet
                  ? `Current balance: ${formatMinorUnits(editingWallet.balanceMinor, editingWallet.currency)}`
                  : 'Add a bank account, e-wallet, card, or cash stash'}
              </ThemedText>
            </View>

            <Pressable
              onPress={() => {
                if (!isBusy) onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close wallet modal"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 active:opacity-75"
            >
              <ThemedText className="text-xs font-bold text-slate-600 dark:text-slate-300">
                ✕
              </ThemedText>
            </Pressable>
          </View>

          {formError && (
            <View className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800">
              <ThemedText className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {formError}
              </ThemedText>
            </View>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-4 pb-2"
          >
            {/* Name */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Wallet Name
              </ThemedText>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (formError) setFormError(null);
                }}
                placeholder="e.g. BPI Checking, GCash, Maya"
                placeholderTextColor="#94a3b8"
                maxLength={40}
                editable={!isBusy}
                className="px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#171f33] text-slate-900 dark:text-white text-sm font-medium"
              />
            </View>

            {/* Account Type */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Account Type
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {WALLET_TYPE_OPTIONS.map((opt) => {
                  const isSelected = type === opt.type;
                  return (
                    <Pressable
                      key={opt.type}
                      onPress={() => handleSelectType(opt.type)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Account type ${opt.label}`}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                        isSelected
                          ? 'bg-brand-500 border-brand-500'
                          : 'bg-slate-50 dark:bg-[#171f33] border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText className="text-sm">{opt.defaultIcon}</ThemedText>
                      <ThemedText
                        className={`text-xs font-semibold ${
                          isSelected
                            ? 'text-white'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Opening Balance (Create & Edit) */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Opening Balance (₱ PHP)
              </ThemedText>
              <TextInput
                value={balanceInput}
                onChangeText={(t) => {
                  setBalanceInput(t);
                  if (formError) setFormError(null);
                }}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                editable={!isBusy}
                className="px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#171f33] text-slate-900 dark:text-white text-base font-bold font-mono"
              />
              {editingWallet && (() => {
                const currentOpening =
                  editingWallet.openingBalanceMinor ?? editingWallet.balanceMinor;
                const netActivity = editingWallet.balanceMinor - currentOpening;
                const parsedNextOpening = parseDecimalToMinorUnits(balanceInput);
                const nextBalance =
                  parsedNextOpening !== null ? parsedNextOpening + netActivity : null;

                return (
                  <View className="p-3 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200/80 dark:border-slate-800 gap-1">
                    <View className="flex-row items-center justify-between">
                      <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400">
                        Recorded net activity
                      </ThemedText>
                      <ThemedText className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {netActivity >= 0 ? '+' : ''}
                        {formatMinorUnits(netActivity, editingWallet.currency)}
                      </ThemedText>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <ThemedText className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        Resulting balance
                      </ThemedText>
                      <ThemedText className="text-xs font-mono font-bold text-brand-500">
                        {nextBalance !== null
                          ? formatMinorUnits(nextBalance, editingWallet.currency)
                          : 'Invalid input'}
                      </ThemedText>
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Icon Selection */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Icon
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {WALLET_ICONS.map((itemIcon) => {
                  const isSelected = icon === itemIcon;
                  return (
                    <Pressable
                      key={itemIcon}
                      onPress={() => setIcon(itemIcon)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select icon ${itemIcon}`}
                      className={`min-h-[44px] min-w-[44px] rounded-xl border items-center justify-center ${
                        isSelected
                          ? 'bg-brand-50 dark:bg-brand-950/60 border-brand-500 border-2'
                          : 'bg-slate-50 dark:bg-[#171f33] border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <ThemedText className="text-lg">{itemIcon}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Color Selection */}
            <View className="gap-1.5">
              <ThemedText className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Accent Color
              </ThemedText>
              <View className="flex-row flex-wrap gap-2.5">
                {WALLET_COLORS.map((hex) => {
                  const isSelected = color === hex;
                  return (
                    <Pressable
                      key={hex}
                      onPress={() => setColor(hex)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select color ${hex}`}
                      className={`min-h-[44px] min-w-[44px] rounded-xl items-center justify-center border ${
                        isSelected
                          ? 'border-slate-900 dark:border-white border-2'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <View
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: hex }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Include in Safe-to-Spend Toggle */}
            <View className="flex-row items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#171f33] border border-slate-200 dark:border-slate-700">
              <View className="flex-1 mr-3">
                <ThemedText className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Include in Safe-to-Spend
                </ThemedText>
                <ThemedText className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Count this wallet as liquid cash available for daily spending
                </ThemedText>
              </View>
              <Switch
                value={includeInSafeToSpend}
                onValueChange={setIncludeInSafeToSpend}
                disabled={isBusy}
                trackColor={{ false: '#cbd5e1', true: '#208AEF' }}
              />
            </View>
          </ScrollView>

          {/* Actions */}
          <View className="gap-2 pt-1">
            <Pressable
              onPress={handleSave}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={editingWallet ? 'Save wallet changes' : 'Create wallet'}
              className="min-h-[44px] w-full py-3 rounded-2xl bg-brand-500 active:bg-brand-600 items-center justify-center shadow-sm"
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText className="text-white font-bold text-sm">
                  {editingWallet ? 'Save Changes' : 'Create Wallet'}
                </ThemedText>
              )}
            </Pressable>

            {editingWallet && (
              <Pressable
                onPress={handleDelete}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${editingWallet.name}`}
                className="min-h-[44px] w-full py-2.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-rose-600 dark:text-rose-400 font-semibold text-xs">
                  Delete Wallet
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
