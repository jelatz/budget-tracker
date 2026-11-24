import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/context/auth-context';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { isAuthenticated } = useAuth();

  return (
    <NativeTabs
      backgroundColor={colors.surface}
      indicatorColor={colors.primarySoft}
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: colors.primary },
      }}>
      <NativeTabs.Trigger name="index" hidden={isAuthenticated}>
        <NativeTabs.Trigger.Label>Sign In</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="login"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="register" hidden={isAuthenticated}>
        <NativeTabs.Trigger.Label>Register</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.badge.plus', selected: 'person.badge.plus' }}
          md="person_add"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="dashboard" hidden={!isAuthenticated}>
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="space_dashboard"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="accounts" hidden={!isAuthenticated}>
        <NativeTabs.Trigger.Label>Accounts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'building.columns', selected: 'building.columns.fill' }}
          md="account_balance_wallet"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="expenses" hidden={!isAuthenticated}>
        <NativeTabs.Trigger.Label>Expenses</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'creditcard', selected: 'creditcard.fill' }}
          md="payments"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="capture" hidden={!isAuthenticated}>
        <NativeTabs.Trigger.Label>Entry</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }}
          md="add_circle"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="transactions" hidden={!isAuthenticated}>
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
          md="receipt_long"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
