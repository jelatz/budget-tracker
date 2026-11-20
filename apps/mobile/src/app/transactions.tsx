import { useLocalSearchParams } from 'expo-router';
import { transactionTypeSchema, type TransactionType } from '@repo/contracts';
import { TransactionsScreen } from '@/features/transactions/screens/transactions-screen';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || undefined;
  return undefined;
}

export default function TransactionsRoute() {
  const params = useLocalSearchParams<{
    type?: string | string[];
    categoryId?: string | string[];
    walletId?: string | string[];
    tag?: string | string[];
    month?: string | string[];
  }>();

  const rawType = firstParam(params.type);
  const parsedType = rawType ? transactionTypeSchema.safeParse(rawType) : null;
  const initialType: 'ALL' | TransactionType | undefined =
    rawType === 'ALL' ? 'ALL' : parsedType?.success ? parsedType.data : undefined;

  const rawMonth = firstParam(params.month);
  const initialMonth = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : undefined;

  return (
    <TransactionsScreen
      initialType={initialType}
      initialCategoryId={firstParam(params.categoryId)}
      initialWalletId={firstParam(params.walletId)}
      initialTag={firstParam(params.tag)}
      initialMonth={initialMonth}
    />
  );
}
