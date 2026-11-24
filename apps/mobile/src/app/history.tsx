import { useLocalSearchParams } from 'expo-router';

import { HistoryScreen } from '@/features/history/screens/history-screen';

type HistoryKind = 'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'RECONCILIATION';

function parseStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function parseHistoryKind(value: string | string[] | undefined): HistoryKind | undefined {
  const normalized = parseStringParam(value)?.toUpperCase();
  if (
    normalized === 'ALL' ||
    normalized === 'INCOME' ||
    normalized === 'EXPENSE' ||
    normalized === 'TRANSFER' ||
    normalized === 'RECONCILIATION'
  ) {
    return normalized;
  }
  return undefined;
}

export default function HistoryRoute() {
  const params = useLocalSearchParams<{
    accountId?: string | string[];
    type?: string | string[];
  }>();

  return (
    <HistoryScreen
      initialAccountId={parseStringParam(params.accountId)}
      initialKind={parseHistoryKind(params.type)}
    />
  );
}
