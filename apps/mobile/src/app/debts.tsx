import { useLocalSearchParams } from 'expo-router';
import { parseDebtsTabParam } from '@repo/contracts';

import { DebtsScreen } from '@/features/debts/screens/debts-screen';

export default function DebtsRoute() {
  const params = useLocalSearchParams<{ tab?: string | string[] }>();

  return <DebtsScreen initialTab={parseDebtsTabParam(params.tab)} />;
}
