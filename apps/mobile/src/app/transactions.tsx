import { useLocalSearchParams } from 'expo-router';
import type { TransactionType } from '@repo/contracts';

import { TransactionsScreen } from '@/features/transactions/screens/transactions-screen';

function parseStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function parseTransactionType(value: string | string[] | undefined): TransactionType | undefined {
  const normalized = parseStringParam(value)?.toUpperCase();
  if (normalized === 'INCOME' || normalized === 'EXPENSE' || normalized === 'TRANSFER') {
    return normalized;
  }
  return undefined;
}

export default function TransactionsRoute() {
  const params = useLocalSearchParams<{
    accountId?: string | string[];
    type?: string | string[];
  }>();

  return (
    <TransactionsScreen
      initialAccountId={parseStringParam(params.accountId)}
      initialType={parseTransactionType(params.type)}
    />
  );
}
