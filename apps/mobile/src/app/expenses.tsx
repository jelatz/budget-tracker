import { useLocalSearchParams } from 'expo-router';

import { ExpensesScreen } from '@/features/expenses/screens/expenses-screen';

function normalizeParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default function ExpensesRoute() {
  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    accountId?: string | string[];
    search?: string | string[];
  }>();

  return (
    <ExpensesScreen
      initialCategoryId={normalizeParam(params.categoryId)}
      initialAccountId={normalizeParam(params.accountId)}
      initialSearch={normalizeParam(params.search)}
    />
  );
}
