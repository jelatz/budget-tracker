import React, { type ComponentRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/common/components/app-icon';
import { useFeedback } from '@/common/components/feedback-provider';
import { useTheme } from '@/common/hooks/use-theme';
import {
  useAccounts,
  useAllCategories,
} from '../hooks/use-transactions';
import { TransactionFormModal } from './transaction-form-modal';

export interface QuickAddTransactionFabProps {
  hidden?: boolean;
  fabRef?: React.Ref<ComponentRef<typeof View>>;
}

export function QuickAddTransactionFab({
  hidden = false,
  fabRef,
}: QuickAddTransactionFabProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showSuccess } = useFeedback();
  const accountsQuery = useAccounts();
  const { categories } = useAllCategories();

  const isDesktop = width >= 768;
  const accounts = accountsQuery.data ?? [];

  return (
    <>
      {!hidden && (
        <View
          ref={fabRef}
          collapsable={false}
          style={{
            position: 'absolute',
            right: isDesktop ? 28 : Math.max(16, insets.right + 16),
            bottom: isDesktop ? 28 : Math.max(12, insets.bottom) + 74,
            zIndex: 25,
          }}
        >
          <Pressable
            onPress={() => setModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
            accessibilityHint="Opens the new transaction form"
            style={[
              Platform.OS === 'web'
                ? {
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
                  }
                : {
                    shadowColor: theme.text,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.22,
                    shadowRadius: 10,
                    elevation: 6,
                  },
            ]}
            className="w-14 h-14 rounded-full bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center active:opacity-90"
          >
            <AppIcon name="add" size={24} color={theme.onPrimary} />
          </Pressable>
        </View>
      )}

      <TransactionFormModal
        visible={modalVisible}
        editingTransaction={null}
        accounts={accounts}
        categories={categories}
        onClose={() => setModalVisible(false)}
        onSaved={showSuccess}
        onDeleted={showSuccess}
      />
    </>
  );
}
