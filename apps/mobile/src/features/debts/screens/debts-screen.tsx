import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  type CommitmentKind,
  type DebtsRouteTab,
  type RecurringCommitment,
} from '@repo/contracts';

import { AppIcon } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { ThemedText } from '@/common/components/themed-text';
import { ThemedView } from '@/common/components/themed-view';
import {
  BottomTabInset,
  TABULAR_NUMS_STYLE,
  WebMaxPageWidth,
} from '@/common/constants/theme';
import { useRequireAuth } from '@/common/hooks/use-require-auth';
import { useTheme } from '@/common/hooks/use-theme';
import { getUserErrorMessage } from '@/common/lib/error-message';
import {
  useAllCategories,
  useDebtOverview,
  useDeleteRecurringCommitment,
} from '@/features/transactions/hooks/use-transactions';

import { CreditCardDebtCard } from '../components/credit-card-debt-card';
import { ObligationCard } from '../components/obligation-card';
import { ObligationFormModal } from '../components/obligation-form-modal';
import { PayObligationModal } from '../components/pay-obligation-modal';

export interface DebtsScreenProps {
  initialTab?: DebtsRouteTab;
}

const TAB_OPTIONS: readonly { key: DebtsRouteTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CREDIT_CARDS', label: 'Credit Cards' },
  { key: 'LOANS', label: 'Loans' },
  { key: 'BILLS', label: 'Home & Bills' },
];

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

export function DebtsScreen({ initialTab = 'ALL' }: DebtsScreenProps = {}) {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const { showSuccess, showError } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;

  const [activeTab, setActiveTab] = useState<DebtsRouteTab>(initialTab);
  const [formVisible, setFormVisible] = useState(false);
  const [editingCommitment, setEditingCommitment] =
    useState<RecurringCommitment | null>(null);
  const [formInitialKind, setFormInitialKind] = useState<CommitmentKind>(
    'CREDIT_CARD_INSTALLMENT',
  );
  const [formInitialAccountId, setFormInitialAccountId] = useState<
    string | undefined
  >(undefined);
  const [payingCommitment, setPayingCommitment] =
    useState<RecurringCommitment | null>(null);

  const { overview, nextPaydayDate, accounts, isLoading, isError, refetch } =
    useDebtOverview();
  const { categories } = useAllCategories();
  const deleteMutation = useDeleteRecurringCommitment();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const debtGridColumns = isWide ? 2 : 1;
  const creditCardRows = useMemo(
    () => chunkIntoRows(overview.creditCards, debtGridColumns),
    [overview.creditCards, debtGridColumns],
  );
  const loanRows = useMemo(
    () => chunkIntoRows(overview.loans, debtGridColumns),
    [overview.loans, debtGridColumns],
  );
  const billRows = useMemo(
    () => chunkIntoRows(overview.bills, debtGridColumns),
    [overview.bills, debtGridColumns],
  );

  if (!isAuthenticated) {
    return null;
  }

  const liquidAccounts = accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
  const accountLookup = new Map(accounts.map((a) => [a.id, a]));
  const currency = accounts[0]?.currency ?? DEFAULT_CURRENCY;
  const scrollBottomPadding = Math.max(40, BottomTabInset + insets.bottom + 28);

  const handleOpenAdd = (
    kind: CommitmentKind = 'BILL',
    presetAccountId?: string,
  ) => {
    setEditingCommitment(null);
    setFormInitialKind(kind);
    setFormInitialAccountId(presetAccountId);
    setFormVisible(true);
  };

  const handleDeleteObligation = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      showSuccess('Obligation removed.');
    } catch (error: unknown) {
      showError(getUserErrorMessage(error, 'Could not delete obligation.'));
    }
  };

  const showCards = activeTab === 'ALL' || activeTab === 'CREDIT_CARDS';
  const showLoans = activeTab === 'ALL' || activeTab === 'LOANS';
  const showBills = activeTab === 'ALL' || activeTab === 'BILLS';

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: scrollBottomPadding,
            ...(Platform.OS === 'web'
              ? { maxWidth: WebMaxPageWidth, alignSelf: 'center' as const }
              : {}),
          }}
        >
          {/* Header */}
          <View className="flex-row flex-wrap items-center justify-between gap-3 mb-4">
            <View className="flex-1 min-w-[180px]">
              <ThemedText
                accessibilityRole="header"
                className="text-2xl font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
              >
                Debts &amp; Bills
              </ThemedText>
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                Credit cards paid in full, installments, loans, and home bills
              </ThemedText>
            </View>

            <Pressable
              onPress={() =>
                handleOpenAdd(
                  activeTab === 'CREDIT_CARDS'
                    ? 'CREDIT_CARD_INSTALLMENT'
                    : activeTab === 'LOANS'
                      ? 'LOAN'
                      : 'BILL',
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Add Debt or Bill"
              className="min-h-[44px] bg-brand-500 dark:bg-brand-400 active:opacity-90 px-4 py-2.5 rounded-full flex-row items-center gap-1.5"
            >
              <AppIcon name="add" size={16} color={theme.onPrimary} />
              <ThemedText className="text-ledger-canvas dark:text-brand-900 font-bold text-xs sm:text-sm">
                Add Obligation
              </ThemedText>
            </Pressable>
          </View>

          {/* 3-Card Summary Strip */}
          <View className="flex-row flex-wrap gap-3 mb-4">
            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Due Before Payday
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-ochre dark:text-ledger-ochre-dark mt-1"
              >
                {formatMinorUnits(overview.dueBeforeNextPaydayMinor, currency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-[48%]'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Card Bills Due
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-terracotta dark:text-ledger-terracotta-dark mt-1"
              >
                {formatMinorUnits(overview.totalCreditCardUpcomingBillMinor, currency)}
              </ThemedText>
            </View>

            <View
              className={`${
                isWide ? 'flex-1 min-w-[180px]' : 'w-full'
              } p-3.5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark`}
            >
              <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                Total Remaining Debt
              </ThemedText>
              <ThemedText
                numeric
                style={TABULAR_NUMS_STYLE}
                className="text-base sm:text-lg font-extrabold text-ledger-ink dark:text-ledger-ink-dark mt-1"
              >
                {formatMinorUnits(overview.totalDebtRemainingMinor, currency)}
              </ThemedText>
            </View>
          </View>

          {/* Filter Tabs */}
          <View
            accessibilityRole="tablist"
            className="flex-row p-1 rounded-2xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark mb-5"
          >
            {TAB_OPTIONS.map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isSelected }}
                  className={`flex-1 min-h-[44px] px-2 py-2 rounded-xl items-center justify-center ${
                    isSelected
                      ? 'bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark'
                      : 'active:opacity-75'
                  }`}
                >
                  <ThemedText
                    numberOfLines={1}
                    className={`text-xs font-bold ${
                      isSelected
                        ? 'text-ledger-ink dark:text-ledger-ink-dark'
                        : 'text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
                    }`}
                  >
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {isLoading ? (
            <View className="p-8 items-center justify-center gap-3 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark">
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText className="text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                Loading debts and monthly obligations...
              </ThemedText>
            </View>
          ) : isError ? (
            <View className="p-6 rounded-2xl bg-ledger-terracotta-soft dark:bg-ledger-terracotta-dark-soft border border-ledger-border dark:border-ledger-border-dark items-center gap-3">
              <AppIcon name="warning" size={24} color={theme.negative} />
              <ThemedText
                accessibilityRole="alert"
                className="text-sm font-semibold text-ledger-terracotta dark:text-ledger-terracotta-dark text-center"
              >
                Unable to load debts right now.
              </ThemedText>
              <Pressable
                onPress={() => {
                  void refetch();
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading debts"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-ledger-terracotta dark:bg-ledger-terracotta-dark items-center justify-center"
              >
                <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-ledger-canvas-dark">
                  Retry
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View className="gap-6">
              {/* Credit Cards Section */}
              {showCards ? (
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Credit Cards (Paid in Full Monthly)
                    </ThemedText>
                    <ThemedText
                      numeric
                      className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                    >
                      {overview.creditCards.length}{' '}
                      {overview.creditCards.length === 1 ? 'card' : 'cards'}
                    </ThemedText>
                  </View>

                  {overview.creditCards.length === 0 ? (
                    <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-2.5">
                      <AppIcon name="creditCard" size={24} color={theme.textMuted} />
                      <ThemedText className="text-sm font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
                        No Credit Cards Added Yet
                      </ThemedText>
                      <ThemedText className="text-xs text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[300px]">
                        Add a Credit Card account in the Accounts tab to combine daily
                        swipes and monthly installments into one clear bill.
                      </ThemedText>
                      <Pressable
                        onPress={() => router.push('/accounts')}
                        accessibilityRole="button"
                        accessibilityLabel="Go to Accounts to add a credit card"
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark justify-center mt-1"
                      >
                        <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                          Manage Accounts
                        </ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="gap-3">
                      {creditCardRows.map((row, rowIndex) => (
                        <View
                          key={`card-row-${rowIndex}`}
                          className="flex-row items-stretch gap-3"
                        >
                          {row.map((summary) => (
                            <View key={summary.account.id} className="flex-1 min-w-0">
                              <CreditCardDebtCard
                                summary={summary}
                                liquidAccounts={liquidAccounts}
                                onAddInstallment={(cardId) =>
                                  handleOpenAdd('CREDIT_CARD_INSTALLMENT', cardId)
                                }
                                onEditInstallment={(inst) => {
                                  setEditingCommitment(inst);
                                  setFormVisible(true);
                                }}
                                onDeleteInstallment={handleDeleteObligation}
                                onBillPaid={showSuccess}
                              />
                            </View>
                          ))}
                          {Array.from({ length: debtGridColumns - row.length }).map(
                            (_, spacerIndex) => (
                              <View
                                key={`card-spacer-${rowIndex}-${spacerIndex}`}
                                className="flex-1 min-w-0"
                              />
                            ),
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Loans Section */}
              {showLoans ? (
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Loans &amp; Fixed Payoffs
                    </ThemedText>
                    <Pressable
                      onPress={() => handleOpenAdd('LOAN')}
                      accessibilityRole="button"
                      accessibilityLabel="Add Loan"
                      className="min-h-[44px] px-3 justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                        + Add Loan
                      </ThemedText>
                    </Pressable>
                  </View>

                  {overview.loans.length === 0 ? (
                    <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-2">
                      <AppIcon name="loan" size={22} color={theme.textMuted} />
                      <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                        No personal, auto, or SSS/Pag-IBIG loans tracked yet.
                      </ThemedText>
                    </View>
                  ) : (
                    <View className="gap-3">
                      {loanRows.map((row, rowIndex) => (
                        <View
                          key={`loan-row-${rowIndex}`}
                          className="flex-row items-stretch gap-3"
                        >
                          {row.map((loan) => (
                            <View key={loan.id} className="flex-1 min-w-0">
                              <ObligationCard
                                commitment={loan}
                                account={accountLookup.get(loan.accountId)}
                                nextPaydayDate={nextPaydayDate}
                                isDeleting={deleteMutation.isPending}
                                onPay={() => setPayingCommitment(loan)}
                                onEdit={() => {
                                  setEditingCommitment(loan);
                                  setFormVisible(true);
                                }}
                                onDelete={() => handleDeleteObligation(loan.id)}
                              />
                            </View>
                          ))}
                          {Array.from({ length: debtGridColumns - row.length }).map(
                            (_, spacerIndex) => (
                              <View
                                key={`loan-spacer-${rowIndex}-${spacerIndex}`}
                                className="flex-1 min-w-0"
                              />
                            ),
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Home & Utilities Section */}
              {showBills ? (
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <ThemedText className="text-[11px] font-bold uppercase tracking-wider text-ledger-ink-muted dark:text-ledger-ink-dark-muted">
                      Home &amp; Utilities (Editable Bill Amounts)
                    </ThemedText>
                    <Pressable
                      onPress={() => handleOpenAdd('BILL')}
                      accessibilityRole="button"
                      accessibilityLabel="Add Home or Utility Bill"
                      className="min-h-[44px] px-3 justify-center"
                    >
                      <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
                        + Add Bill
                      </ThemedText>
                    </Pressable>
                  </View>

                  {overview.bills.length === 0 ? (
                    <View className="p-5 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-2">
                      <AppIcon name="calendar" size={22} color={theme.textMuted} />
                      <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center">
                        Add recurring rent, electricity, water, or internet bills here.
                      </ThemedText>
                    </View>
                  ) : (
                    <View className="gap-3">
                      {billRows.map((row, rowIndex) => (
                        <View
                          key={`bill-row-${rowIndex}`}
                          className="flex-row items-stretch gap-3"
                        >
                          {row.map((bill) => (
                            <View key={bill.id} className="flex-1 min-w-0">
                              <ObligationCard
                                commitment={bill}
                                account={accountLookup.get(bill.accountId)}
                                nextPaydayDate={nextPaydayDate}
                                isDeleting={deleteMutation.isPending}
                                onPay={() => setPayingCommitment(bill)}
                                onEdit={() => {
                                  setEditingCommitment(bill);
                                  setFormVisible(true);
                                }}
                                onDelete={() => handleDeleteObligation(bill.id)}
                              />
                            </View>
                          ))}
                          {Array.from({ length: debtGridColumns - row.length }).map(
                            (_, spacerIndex) => (
                              <View
                                key={`bill-spacer-${rowIndex}-${spacerIndex}`}
                                className="flex-1 min-w-0"
                              />
                            ),
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>

        <ObligationFormModal
          visible={formVisible}
          editingCommitment={editingCommitment}
          initialKind={formInitialKind}
          initialAccountId={formInitialAccountId}
          accounts={accounts}
          categories={categories}
          onClose={() => {
            setFormVisible(false);
            setEditingCommitment(null);
          }}
          onSaved={showSuccess}
        />

        <PayObligationModal
          visible={payingCommitment !== null}
          commitment={payingCommitment}
          accounts={accounts}
          onClose={() => setPayingCommitment(null)}
          onPaid={showSuccess}
        />
      </SafeAreaView>
    </ThemedView>
  );
}
