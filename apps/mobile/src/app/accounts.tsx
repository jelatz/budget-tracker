import { useLocalSearchParams } from 'expo-router';
import { parseAccountsTabParam } from '@repo/contracts';

import { AccountsScreen } from '@/features/accounts/screens/accounts-screen';

export default function AccountsRoute() {
  const params = useLocalSearchParams<{ tab?: string | string[] }>();

  return <AccountsScreen initialTab={parseAccountsTabParam(params.tab)} />;
}
