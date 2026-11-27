import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_CURRENCY,
  formatMinorUnits,
  type Account,
  type Category,
  type CommitmentKind,
  type CreditCardBillSummary,
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
  useUnpayCreditCardBill,
  useUnpayRecurringCommitment,
} from '@/features/transactions/hooks/use-transactions';

import { CreditCardDebtCard } from '../components/credit-card-debt-card';
import { ObligationCard } from '../components/obligation-card';
import { ObligationFormModal } from '../components/obligation-form-modal';
import { PayObligationModal } from '../components/pay-obligation-modal';

export interface DebtsScreenProps {
  initialTab?: DebtsRouteTab;
}

type DebtSectionKey = 'CREDIT_CARDS' | 'LOANS' | 'BILLS';

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

function tokenizeSearchQuery(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed.split(/\s+/) : [];
}

function matchesSearchTokens(
  tokens: readonly string[],
  fields: readonly (string | null | undefined)[],
): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const haystack = fields
    .filter((field): field is string => typeof field === 'string' && field.length > 0)
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function matchesCommitment(
  commitment: RecurringCommitment,
  tokens: readonly string[],
  accountLookup: Map<string, Account>,
  categoryLookup: Map<string, Category>,
): boolean {
  return matchesSearchTokens(tokens, [
    commitment.name,
    commitment.notes,
    commitment.dueLabel,
    commitment.frequency,
    commitment.nextDueDate,
    commitment.currency,
    accountLookup.get(commitment.accountId)?.name,
    categoryLookup.get(commitment.categoryId)?.name,
  ]);
}

function matchesCreditCardSummary(
  summary: CreditCardBillSummary,
  tokens: readonly string[],
  categoryLookup: Map<string, Category>,
): boolean {
  const matchesCard = matchesSearchTokens(tokens, [
    summary.account.name,
    summary.account.currency,
    summary.dueScheduleLabel,
    summary.dueDate,
    summary.isPaydownPlan ? 'paydown plan' : '',
  ]);
  if (matchesCard) {
    return true;
  }
  return summary.installments.some((inst) =>
    matchesSearchTokens(tokens, [
      inst.name,
      inst.notes,
      inst.dueLabel,
      inst.frequency,
      categoryLookup.get(inst.categoryId)?.name,
    ]),
  );
}

export function DebtsScreen({ initialTab = 'ALL' }: DebtsScreenProps = {}) {
  const { isAuthenticated } = useRequireAuth();
  const theme = useTheme();
  const { showSuccess, showError } = useFeedback();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;

  const [activeTab, setActiveTab] = useState<DebtsRouteTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<
    Record<DebtSectionKey, boolean>
  >({
    CREDIT_CARDS: false,
    LOANS: false,
    BILLS: false,
  });
  const [formVisible, setFormVisible] = useState(false);
  const [editingCommitment, setEditingCommitment] =
    useState<RecurringCommitment | null>(null);
  const [formInitialKind, setFormInitialKind] = useState<CommitmentKind>(
    'CREDIT_CARD_INSTALLMENT',
  );
  const [formInitialAccountId, setFormInitialAccountId] = useState<
    string | undefined
  >(undefined);
  const [payingModalState, setPayingModalState] = useState<{
    commitment: RecurringCommitment;
    mode: 'pay' | 'advance';
  } | null>(null);

  const { overview, nextPaydayDate, accounts, isLoading, isError, refetch } =
    useDebtOverview();
  const { categories } = useAllCategories();
  const deleteMutation = useDeleteRecurringCommitment();
  const unpayMutation = useUnpayRecurringCommitment();
  const unpayCardMutation = useUnpayCreditCardBill();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const accountLookup = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryLookup = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const searchTokens = useMemo(
    () => tokenizeSearchQuery(searchQuery),
    [searchQuery],
  );
  const hasSearchQuery = searchTokens.length > 0;

  const filteredCreditCards = useMemo(
    () =>
      !hasSearchQuery
        ? overview.creditCards
        : overview.creditCards.filter((summary) =>
            matchesCreditCardSummary(summary, searchTokens, categoryLookup),
          ),
    [overview.creditCards, hasSearchQuery, searchTokens, categoryLookup],
  );
  const filteredLoans = useMemo(
    () =>
      !hasSearchQuery
        ? overview.loans
        : overview.loans.filter((loan) =>
            matchesCommitment(loan, searchTokens, accountLookup, categoryLookup),
          ),
    [overview.loans, hasSearchQuery, searchTokens, accountLookup, categoryLookup],
  );
  const filteredBills = useMemo(
    () =>
      !hasSearchQuery
        ? overview.bills
        : overview.bills.filter((bill) =>
            matchesCommitment(bill, searchTokens, accountLookup, categoryLookup),
          ),
    [overview.bills, hasSearchQuery, searchTokens, accountLookup, categoryLookup],
  );

  const debtGridColumns = isWide ? 2 : 1;
  const creditCardRows = useMemo(
    () => chunkIntoRows(filteredCreditCards, debtGridColumns),
    [filteredCreditCards, debtGridColumns],
  );
  const loanRows = useMemo(
    () => chunkIntoRows(filteredLoans, debtGridColumns),
    [filteredLoans, debtGridColumns],
  );
  const billRows = useMemo(
    () => chunkIntoRows(filteredBills, debtGridColumns),
    [filteredBills, debtGridColumns],
  );

  if (!isAuthenticated) {
    return null;
  }

  const liquidAccounts = accounts.filter((a) => a.accountType !== 'CREDIT_CARD');
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

  const handleUnpayObligation = async (commitment: RecurringCommitment) => {
    try {
      await unpayMutation.mutateAsync(commitment.id);
      showSuccess(`Marked ${commitment.name} as unpaid.`);
    } catch (error: unknown) {
      showError(getUserErrorMessage(error, 'Could not undo payment.'));
    }
  };

  const handleUnpayCardBill = async (cardAccount: Account) => {
    try {
      await unpayCardMutation.mutateAsync(cardAccount.id);
      showSuccess(`Undid last payment for ${cardAccount.name}.`);
    } catch (error: unknown) {
      showError(getUserErrorMessage(error, 'Could not undo credit card payment.'));
    }
  };

  const toggleSection = (section: DebtSectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSelectTab = (tab: DebtsRouteTab) => {
    setActiveTab(tab);
    if (tab !== 'ALL') {
      setCollapsedSections((prev) =>
        prev[tab] ? { ...prev, [tab]: false } : prev,
      );
    }
  };

  const handleSearchChange = (nextQuery: string) => {
    if (searchQuery.trim().length === 0 && nextQuery.trim().length > 0) {
      setCollapsedSections({
        CREDIT_CARDS: false,
        LOANS: false,
        BILLS: false,
      });
    }
    setSearchQuery(nextQuery);
  };

  const showCards = activeTab === 'ALL' || activeTab === 'CREDIT_CARDS';
  const showLoans = activeTab === 'ALL' || activeTab === 'LOANS';
  const showBills = activeTab === 'ALL' || activeTab === 'BILLS';

  const totalAllTabMatches =
    filteredCreditCards.length + filteredLoans.length + filteredBills.length;
  const visibleMatchCount =
    (showCards ? filteredCreditCards.length : 0) +
    (showLoans ? filteredLoans.length : 0) +
    (showBills ? filteredBills.length : 0);
  const renderCardsSection =
    showCards && (!hasSearchQuery || filteredCreditCards.length > 0);
  const renderLoansSection =
    showLoans && (!hasSearchQuery || filteredLoans.length > 0);
  const renderBillsSection =
    showBills && (!hasSearchQuery || filteredBills.length > 0);

  return (
    <ThemedView className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
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
                Credit cards, paydown plans, loans, and home bills
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

          {/* Search Bar */}
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-1 flex-row items-center h-12 px-3.5 gap-2 rounded-xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark">
              <AppIcon name="search" size={16} color={theme.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder="Search card, installment, loan, bill, or account..."
                placeholderTextColor={theme.textMuted}
                accessibilityLabel="Search debts and bills"
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 h-full text-ledger-ink dark:text-ledger-ink-dark text-sm"
              />
            </View>
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search query"
                className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
              >
                <ThemedText className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  Clear
                </ThemedText>
              </Pressable>
            ) : null}
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
                  onPress={() => handleSelectTab(tab.key)}
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
          ) : hasSearchQuery && visibleMatchCount === 0 ? (
            <View className="p-6 rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border dark:border-ledger-border-dark items-center gap-3">
              <AppIcon name="search" size={26} color={theme.textMuted} />
              <ThemedText className="text-base font-bold text-ledger-ink dark:text-ledger-ink-dark text-center">
                No Matching Debts or Bills
              </ThemedText>
              <ThemedText className="text-xs sm:text-sm font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary text-center max-w-[320px]">
                No debts or bills match &ldquo;{searchQuery.trim()}&rdquo;
                {activeTab !== 'ALL'
                  ? ` in ${TAB_OPTIONS.find((t) => t.key === activeTab)?.label ?? 'this tab'}`
                  : ''}
                .
              </ThemedText>
              <View className="flex-row flex-wrap justify-center gap-2 mt-1">
                <Pressable
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search query"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
                >
                  <ThemedText className="text-xs font-bold text-ledger-ink dark:text-ledger-ink-dark">
                    Clear Search
                  </ThemedText>
                </Pressable>
                {activeTab !== 'ALL' && totalAllTabMatches > 0 ? (
                  <Pressable
                    onPress={() => setActiveTab('ALL')}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${totalAllTabMatches} matches in All Tabs`}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-brand-500 dark:bg-brand-400 items-center justify-center active:opacity-90"
                  >
                    <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
                      Show {totalAllTabMatches} in All Tabs
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <View className="gap-8">
              {hasSearchQuery ? (
                <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary -mb-4">
                  Showing {visibleMatchCount}{' '}
                  {visibleMatchCount === 1 ? 'match' : 'matches'}
                </ThemedText>
              ) : null}
              {/* Credit Cards Section */}
              {renderCardsSection ? (
                <View className="gap-3.5">
                  <View className="flex-row items-center justify-between gap-3 pb-2.5 border-b border-ledger-border-strong dark:border-ledger-border-strong-dark">
                    <Pressable
                      onPress={() => toggleSection('CREDIT_CARDS')}
                      accessibilityRole="button"
                      accessibilityLabel={`${
                        collapsedSections.CREDIT_CARDS ? 'Expand' : 'Collapse'
                      } Credit Cards section`}
                      accessibilityState={{ expanded: !collapsedSections.CREDIT_CARDS }}
                      className="flex-1 min-w-0 min-h-[44px] flex-row items-center gap-2 active:opacity-75"
                    >
                      <AppIcon
                        name={
                          collapsedSections.CREDIT_CARDS
                            ? 'chevronRight'
                            : 'chevronDown'
                        }
                        size={16}
                        color={theme.textSecondary}
                      />
                      <AppIcon name="creditCard" size={18} color={theme.primary} />
                      <ThemedText
                        accessibilityRole="header"
                        className="text-base sm:text-lg font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark flex-shrink"
                      >
                        Credit Cards
                      </ThemedText>
                    </Pressable>
                    <View className="shrink-0 px-2.5 py-1 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                      <ThemedText
                        numeric
                        className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                      >
                        {filteredCreditCards.length}{' '}
                        {filteredCreditCards.length === 1 ? 'card' : 'cards'}
                      </ThemedText>
                    </View>
                  </View>

                  {!collapsedSections.CREDIT_CARDS ? (
                    filteredCreditCards.length === 0 ? (
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
                                isUnpaying={unpayMutation.isPending}
                                isUnpayingBill={unpayCardMutation.isPending}
                                onAddInstallment={(cardId) =>
                                  handleOpenAdd('CREDIT_CARD_INSTALLMENT', cardId)
                                }
                                onPayInstallment={(inst, mode) =>
                                  setPayingModalState({ commitment: inst, mode })
                                }
                                onEditInstallment={(inst) => {
                                  setEditingCommitment(inst);
                                  setFormVisible(true);
                                }}
                                onDeleteInstallment={handleDeleteObligation}
                                onUnpayInstallment={handleUnpayObligation}
                                onUnpayBill={handleUnpayCardBill}
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
                  )
                  ) : null}
                </View>
              ) : null}

              {/* Loans Section */}
              {renderLoansSection ? (
                <View className="gap-3.5">
                  <View className="flex-row items-center justify-between gap-3 pb-2.5 border-b border-ledger-border-strong dark:border-ledger-border-strong-dark">
                    <Pressable
                      onPress={() => toggleSection('LOANS')}
                      accessibilityRole="button"
                      accessibilityLabel={`${
                        collapsedSections.LOANS ? 'Expand' : 'Collapse'
                      } Loans & Fixed Payoffs section`}
                      accessibilityState={{ expanded: !collapsedSections.LOANS }}
                      className="flex-1 min-w-0 min-h-[44px] flex-row items-center gap-2 active:opacity-75"
                    >
                      <AppIcon
                        name={
                          collapsedSections.LOANS ? 'chevronRight' : 'chevronDown'
                        }
                        size={16}
                        color={theme.textSecondary}
                      />
                      <AppIcon name="loan" size={18} color={theme.info} />
                      <ThemedText
                        accessibilityRole="header"
                        className="text-base sm:text-lg font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark flex-shrink"
                      >
                        Loans &amp; Fixed Payoffs
                      </ThemedText>
                      <View className="shrink-0 px-2 py-0.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                        <ThemedText
                          numeric
                          className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                        >
                          {filteredLoans.length}
                        </ThemedText>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => handleOpenAdd('LOAN')}
                      accessibilityRole="button"
                      accessibilityLabel="Add Loan"
                      className="shrink-0 min-h-[44px] px-3 justify-center"
                    >
                      <ThemedText className="text-xs sm:text-sm font-bold text-brand-500 dark:text-brand-400">
                        + Add Loan
                      </ThemedText>
                    </Pressable>
                  </View>

                  {!collapsedSections.LOANS ? (
                    filteredLoans.length === 0 ? (
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
                                isUnpaying={unpayMutation.isPending}
                                onPay={() =>
                                  setPayingModalState({ commitment: loan, mode: 'pay' })
                                }
                                onAdvancePay={() =>
                                  setPayingModalState({
                                    commitment: loan,
                                    mode: 'advance',
                                  })
                                }
                                onUnpay={() => handleUnpayObligation(loan)}
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
                  )
                  ) : null}
                </View>
              ) : null}

              {/* Home & Utilities Section */}
              {renderBillsSection ? (
                <View className="gap-3.5">
                  <View className="flex-row items-center justify-between gap-3 pb-2.5 border-b border-ledger-border-strong dark:border-ledger-border-strong-dark">
                    <Pressable
                      onPress={() => toggleSection('BILLS')}
                      accessibilityRole="button"
                      accessibilityLabel={`${
                        collapsedSections.BILLS ? 'Expand' : 'Collapse'
                      } Home & Utilities section`}
                      accessibilityState={{ expanded: !collapsedSections.BILLS }}
                      className="flex-1 min-w-0 min-h-[44px] flex-row items-center gap-2 active:opacity-75"
                    >
                      <AppIcon
                        name={
                          collapsedSections.BILLS ? 'chevronRight' : 'chevronDown'
                        }
                        size={16}
                        color={theme.textSecondary}
                      />
                      <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2">
                          <AppIcon name="calendar" size={18} color={theme.textSecondary} />
                          <ThemedText
                            accessibilityRole="header"
                            className="text-base sm:text-lg font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark flex-shrink"
                          >
                            Home &amp; Utilities
                          </ThemedText>
                          <View className="shrink-0 px-2 py-0.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
                            <ThemedText
                              numeric
                              className="text-xs font-bold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary"
                            >
                              {filteredBills.length}
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText className="text-xs font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary mt-0.5">
                          Editable monthly bill amounts
                        </ThemedText>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => handleOpenAdd('BILL')}
                      accessibilityRole="button"
                      accessibilityLabel="Add Home or Utility Bill"
                      className="shrink-0 min-h-[44px] px-3 justify-center"
                    >
                      <ThemedText className="text-xs sm:text-sm font-bold text-brand-500 dark:text-brand-400">
                        + Add Bill
                      </ThemedText>
                    </Pressable>
                  </View>

                  {!collapsedSections.BILLS ? (
                    filteredBills.length === 0 ? (
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
                                isUnpaying={unpayMutation.isPending}
                                onPay={() =>
                                  setPayingModalState({ commitment: bill, mode: 'pay' })
                                }
                                onAdvancePay={() =>
                                  setPayingModalState({
                                    commitment: bill,
                                    mode: 'advance',
                                  })
                                }
                                onUnpay={() => handleUnpayObligation(bill)}
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
                  )
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>

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
          visible={payingModalState !== null}
          commitment={payingModalState?.commitment ?? null}
          mode={payingModalState?.mode ?? 'pay'}
          accounts={accounts}
          onClose={() => setPayingModalState(null)}
          onPaid={showSuccess}
        />
      </SafeAreaView>
    </ThemedView>
  );
}
