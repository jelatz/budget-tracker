import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/common/hooks/use-theme';
import { AppIcon, type AppIconName } from './app-icon';
import { ThemedText } from './themed-text';

type TourRoute =
  | '/dashboard'
  | '/accounts'
  | '/expenses'
  | '/transactions'
  | '/reconciliation';

interface TourStep {
  id: string;
  title: string;
  subtitle: string;
  icon: AppIconName;
  route?: TourRoute;
  routeLabel?: string;
  highlights: readonly string[];
}

const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'dashboard',
    title: 'Your Financial Snapshot',
    subtitle: 'See your safe daily spending limit and overall health at a glance.',
    icon: 'dashboard',
    route: '/dashboard',
    routeLabel: 'Dashboard',
    highlights: [
      'Safe to Spend subtracts upcoming fixed bills, remaining category budgets, and sinking funds from your liquid cash.',
      'Net Worth, Cashflow, Accounts, Income Sources, Budgets, and Tag insights update live as you log entries.',
      'Switch between This Month, Last 7 Days, and All Time from the top bar.',
    ],
  },
  {
    id: 'quick-add',
    title: 'Quick-Add Anywhere (+)',
    subtitle: 'Tap the floating + button at the bottom-right corner on any screen.',
    icon: 'add',
    highlights: [
      'Record Outgoing expenses, Incoming payouts, or Account Transfers without leaving your current page.',
      'Classify entries with Categories or split one receipt across multiple categories.',
      'Add optional Merchant / Counterparty, #Tags, and Notes for faster search later.',
    ],
  },
  {
    id: 'accounts-income-savings',
    title: 'Accounts, Income & Sinking Funds',
    subtitle: 'Keep your balances, paydays, and savings goals together in one place.',
    icon: 'accounts',
    route: '/accounts',
    routeLabel: 'Accounts',
    highlights: [
      'Accounts tracks your Bank, E-Wallet, Cash, and Credit Card balances.',
      'Income Sources tracks Received vs. Expected monthly pay and gives you 1-tap Log Payday.',
      'Sinking Funds lets you stash money toward savings targets and isolates those funds from Safe to Spend.',
    ],
  },
  {
    id: 'expenses-budgets',
    title: 'Expenses, Bills & Budgets',
    subtitle: 'Stay ahead of recurring bills, installments, and monthly spending limits.',
    icon: 'expenses',
    route: '/expenses',
    routeLabel: 'Expenses',
    highlights: [
      'Recorded lets you review and edit day-to-day spending in cards or table view.',
      'Recurring & Loans filters bills by All, Unpaid (due this month), Upcoming (future months), and Paid—with Pay & Deduct or Pay Early.',
      'Budgets tracks your overall monthly target and Category Envelopes with optional rollover.',
    ],
  },
  {
    id: 'transactions-history',
    title: 'Transactions & History',
    subtitle: 'Inspect every movement across accounts with fast filtering and search.',
    icon: 'history',
    route: '/transactions',
    routeLabel: 'Transactions',
    highlights: [
      'Transactions gives you a full ledger filtered by period, account, type (Incoming, Outgoing, Transfer), or search text.',
      'History provides a clean chronological activity stream across all accounts and #tags.',
    ],
  },
  {
    id: 'reconcile-backup',
    title: 'Reconcile, Backup & Replay',
    subtitle: 'Keep balances exact and your data portable whenever you need it.',
    icon: 'reconcile',
    route: '/reconciliation',
    routeLabel: 'Reconcile',
    highlights: [
      'Reconcile matches app balances to your real bank statements with automatic adjustment entries.',
      'Backup & Export lets you download or restore full JSON backups and export CSV spreadsheets.',
      'Want a refresher anytime? Tap Quick Tour right above your name in the sidebar.',
    ],
  },
];

export interface AppTourModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AppTourModal({ visible, onClose }: AppTourModalProps) {
  const theme = useTheme();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setStepIndex(0);
    }
  }, [visible]);

  const goToStep = useCallback((nextIndex: number) => {
    const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, nextIndex));
    setStepIndex(clamped);
    const targetRoute = TOUR_STEPS[clamped]?.route;
    if (targetRoute) {
      router.push(targetRoute);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        if (stepIndex < TOUR_STEPS.length - 1) {
          goToStep(stepIndex + 1);
        } else {
          onClose();
        }
      } else if (event.key === 'ArrowLeft' && stepIndex > 0) {
        goToStep(stepIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, stepIndex, goToStep, onClose]);

  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progressPercent = Math.round(((stepIndex + 1) * 100) / TOUR_STEPS.length);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView
        className="flex-1 bg-black/55"
        edges={['top', 'bottom', 'left', 'right']}
      >
        <View className="flex-1 justify-center items-center p-4">
          <Pressable
            className="absolute inset-0"
            accessibilityRole="button"
            accessibilityLabel="Dismiss quick tour"
            onPress={onClose}
          />

          <View
            accessibilityViewIsModal
            className="relative z-10 w-full max-w-[480px] rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark p-6 gap-4"
          >
            {/* Header Row */}
            <View className="flex-row items-center justify-between gap-2">
              <View className="px-2.5 py-1 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark">
                <ThemedText
                  numeric
                  className="text-xs font-bold text-brand-500 dark:text-brand-400"
                >
                  {`Step ${stepIndex + 1} of ${TOUR_STEPS.length}`}
                </ThemedText>
              </View>

              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Skip quick tour"
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Skip
                </ThemedText>
              </Pressable>
            </View>

            {/* Progress Bar */}
            <View className="h-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
              <View
                className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
                style={{ width: `${progressPercent}%` }}
              />
            </View>

            {/* Step Body */}
            <ScrollView
              className="max-h-[360px]"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-4">
                <View className="flex-row items-start gap-3">
                  <View className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center shrink-0">
                    <AppIcon name={step.icon} size={22} color={theme.primary} />
                  </View>

                  <View className="flex-1 min-w-0 gap-1">
                    <ThemedText
                      accessibilityRole="header"
                      className="text-lg font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                    >
                      {step.title}
                    </ThemedText>
                    <ThemedText className="text-xs leading-5 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                      {step.subtitle}
                    </ThemedText>
                  </View>
                </View>

                <View className="gap-2.5 p-3.5 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                  {step.highlights.map((item) => (
                    <View key={item} className="flex-row items-start gap-2.5">
                      <View className="mt-0.5 shrink-0">
                        <AppIcon
                          name="checkCircle"
                          size={15}
                          color={theme.positive}
                        />
                      </View>
                      <ThemedText className="flex-1 text-xs leading-5 text-ledger-ink dark:text-ledger-ink-dark">
                        {item}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Step Dots */}
            <View className="flex-row items-center justify-center gap-2">
              {TOUR_STEPS.map((item, idx) => {
                const isActive = idx === stepIndex;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => goToStep(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to step ${idx + 1}: ${item.title}`}
                    accessibilityState={{ selected: isActive }}
                    hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
                    className={`h-2.5 rounded-full ${
                      isActive
                        ? 'w-6 bg-brand-500 dark:bg-brand-400'
                        : 'w-2.5 bg-ledger-border-strong dark:bg-ledger-border-strong-dark active:opacity-75'
                    }`}
                  />
                );
              })}
            </View>

            {/* Footer Controls */}
            <View className="flex-row flex-wrap items-center justify-between gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
              {!isFirst ? (
                <Pressable
                  onPress={() => goToStep(stepIndex - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous tour step"
                  className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                    Back
                  </ThemedText>
                </Pressable>
              ) : (
                <View />
              )}

              <View className="flex-row items-center gap-2">
                {step.route && step.routeLabel ? (
                  <Pressable
                    onPress={() => {
                      const target = step.route;
                      onClose();
                      if (target) {
                        router.push(target);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${step.routeLabel} and finish tour`}
                    className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                  >
                    <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                      {`Open ${step.routeLabel}`}
                    </ThemedText>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    if (isLast) {
                      onClose();
                    } else {
                      goToStep(stepIndex + 1);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? 'Finish quick tour' : 'Next tour step'}
                  className="min-h-[44px] min-w-[44px] px-5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center"
                >
                  <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                    {isLast ? 'Done' : 'Next'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
