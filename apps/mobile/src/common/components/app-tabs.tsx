import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
  type TabListProps,
} from 'expo-router/ui';
import { router, Slot } from 'expo-router';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/context/auth-context';
import {
  markTourCompleted,
  shouldAutoStartTour,
} from '@/common/lib/app-tour-storage';
import type { Rect, TourTargetId } from '@/common/lib/tour-geometry';
import { QuickAddTransactionFab } from '@/features/transactions/components/quick-add-transaction-fab';
import { useTheme } from '@/hooks/use-theme';
import { AppIcon } from './app-icon';
import { AppTourOverlay, TOUR_STEPS } from './app-tour-overlay';
import { SyncStatusBadge } from './sync-status-badge';
import { ThemedText } from './themed-text';

export default function AppTabs() {
  const { user, isAuthenticated, logout } = useAuth();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tourVisible, setTourVisible] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourTargetRect, setTourTargetRect] = useState<Rect | null>(null);

  type TourViewRef = ComponentRef<typeof View>;
  const rootRef = useRef<TourViewRef>(null);
  const tourTargetRefs = useRef<Partial<Record<TourTargetId, TourViewRef | null>>>({});
  const tourRefCallbacks = useRef<
    Partial<Record<TourTargetId, (node: TourViewRef | null) => void>>
  >({});

  const getTourRef = useCallback((id: TourTargetId) => {
    let cb = tourRefCallbacks.current[id];
    if (!cb) {
      cb = (node: TourViewRef | null) => {
        tourTargetRefs.current[id] = node;
      };
      tourRefCallbacks.current[id] = cb;
    }
    return cb;
  }, []);

  const isDesktop = width >= 768;
  const activeTourStep = TOUR_STEPS[tourStepIndex] ?? TOUR_STEPS[0];

  useEffect(() => {
    if (isAuthenticated && user?.id && shouldAutoStartTour(user.id)) {
      setTourStepIndex(0);
      setTourTargetRect(null);
      setTourVisible(true);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      isDesktop ||
      !drawerOpen
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDesktop, drawerOpen]);

  // Coordinate mobile drawer open/close state with the active tour target.
  useEffect(() => {
    if (!tourVisible || isDesktop) {
      return;
    }
    if (activeTourStep.targetId === 'fab-quick-add') {
      setDrawerOpen(false);
    } else {
      setDrawerOpen(true);
    }
  }, [tourVisible, isDesktop, activeTourStep.targetId]);

  const measureActiveTourTarget = useCallback(() => {
    if (!tourVisible) {
      return;
    }
    const targetNode = tourTargetRefs.current[activeTourStep.targetId];
    const containerNode = rootRef.current;
    if (!targetNode || !containerNode) {
      setTourTargetRect(null);
      return;
    }

    targetNode.measureInWindow((tx, ty, tw, th) => {
      containerNode.measureInWindow((cx, cy, _cw, _ch) => {
        if (tw > 0 && th > 0) {
          const nextRect: Rect = {
            x: tx - cx,
            y: ty - cy,
            width: tw,
            height: th,
          };
          setTourTargetRect((prev) =>
            prev &&
            Math.abs(prev.x - nextRect.x) < 0.5 &&
            Math.abs(prev.y - nextRect.y) < 0.5 &&
            Math.abs(prev.width - nextRect.width) < 0.5 &&
            Math.abs(prev.height - nextRect.height) < 0.5
              ? prev
              : nextRect,
          );
        } else {
          setTourTargetRect(null);
        }
      });
    });
  }, [tourVisible, activeTourStep.targetId]);

  useEffect(() => {
    if (!tourVisible) {
      return;
    }
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (!cancelled) {
        measureActiveTourTarget();
      }
    });
    const retryTimer = setTimeout(() => {
      if (!cancelled) {
        measureActiveTourTarget();
      }
    }, 110);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(retryTimer);
    };
  }, [
    tourVisible,
    tourStepIndex,
    width,
    height,
    drawerOpen,
    measureActiveTourTarget,
  ]);

  const handleStartTour = () => {
    setDrawerOpen(false);
    setTourStepIndex(0);
    setTourTargetRect(null);
    setTourVisible(true);
  };

  const handleCloseTour = () => {
    setTourVisible(false);
    setTourTargetRect(null);
    if (!isDesktop) {
      setDrawerOpen(false);
    }
    if (user?.id) {
      markTourCompleted(user.id);
    }
  };

  const handleNavScroll = useCallback(() => {
    if (tourVisible) {
      measureActiveTourTarget();
    }
  }, [tourVisible, measureActiveTourTarget]);

  const handleSignOut = async () => {
    setDrawerOpen(false);
    try {
      await logout();
      router.replace('/');
    } catch (_error: unknown) {
      router.replace('/');
    }
  };

  if (!isAuthenticated) {
    return (
      <View className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark">
        <Slot />
      </View>
    );
  }

  return (
    <View
      ref={rootRef}
      collapsable={false}
      className="flex-1 bg-ledger-canvas dark:bg-ledger-canvas-dark"
    >
      <Tabs
        key="auth-tabs"
        style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {!isDesktop && (
          <SafeAreaView
            edges={['top', 'left', 'right']}
            className="bg-ledger-surface dark:bg-ledger-surface-dark border-b border-ledger-border dark:border-ledger-border-dark z-30">
            <View className="min-h-[56px] px-3 flex-row items-center justify-between gap-2">
              <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
                <Pressable
                  onPress={() => setDrawerOpen((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    drawerOpen ? 'Close navigation menu' : 'Open navigation menu'
                  }
                  accessibilityState={{ expanded: drawerOpen }}
                  className="w-11 h-11 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75">
                  <HamburgerIcon color={theme.text} />
                </Pressable>
                <ThemedText
                  className="text-sm font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark flex-1"
                  numberOfLines={1}>
                  Budget Tracker
                </ThemedText>
              </View>

              <View className="flex-row items-center gap-2 shrink-0">
                <SyncStatusBadge compact />
                <Pressable
                  onPress={() => {
                    void handleSignOut();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Sign Out"
                  className="min-h-[44px] px-3 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75">
                  <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                    Sign Out
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        )}

        {!isDesktop && drawerOpen && (
          <Pressable
            onPress={() => setDrawerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            className="absolute inset-0 z-40 bg-black/45"
          />
        )}

        <TabList asChild>
          <SidebarTabList
            isDesktop={isDesktop}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onStartTour={handleStartTour}
            onNavScroll={handleNavScroll}>
            <TabTrigger name="dashboard" href="/dashboard" asChild>
              <SidebarNavItem
                label="Dashboard"
                tourRef={getTourRef('nav-dashboard')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="accounts" href="/accounts" asChild>
              <SidebarNavItem
                label="Accounts"
                tourRef={getTourRef('nav-accounts')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="expenses" href="/expenses" asChild>
              <SidebarNavItem
                label="Expenses"
                tourRef={getTourRef('nav-expenses')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="transactions" href="/transactions" asChild>
              <SidebarNavItem
                label="Transactions"
                tourRef={getTourRef('nav-transactions')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="history" href="/history" asChild>
              <SidebarNavItem
                label="History"
                tourRef={getTourRef('nav-history')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="reconciliation" href="/reconciliation" asChild>
              <SidebarNavItem
                label="Reconcile"
                tourRef={getTourRef('nav-reconciliation')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
            <TabTrigger name="portability" href="/portability" asChild>
              <SidebarNavItem
                label="Backup & Export"
                tourRef={getTourRef('nav-portability')}
                onNavigate={() => setDrawerOpen(false)}
              />
            </TabTrigger>
          </SidebarTabList>
        </TabList>

        <TabSlot style={{ flex: 1, minWidth: 0, height: '100%' }} />
      </Tabs>

      <QuickAddTransactionFab
        hidden={!isDesktop && drawerOpen}
        fabRef={getTourRef('fab-quick-add')}
      />
      <AppTourOverlay
        visible={tourVisible}
        isDesktop={isDesktop}
        activeStepIndex={tourStepIndex}
        onStepChange={setTourStepIndex}
        onClose={handleCloseTour}
        targetRect={tourTargetRect}
      />
    </View>
  );
}

type SidebarNavItemProps = TabTriggerSlotProps & {
  label: string;
  tourRef?: (node: ComponentRef<typeof View> | null) => void;
  onNavigate?: () => void;
};

export function SidebarNavItem({
  isFocused,
  label,
  tourRef,
  onNavigate,
  onPress,
  style,
  ...rest
}: SidebarNavItemProps) {
  const { ref: _ref, ...pressableProps } = rest as Omit<
    SidebarNavItemProps,
    'isFocused' | 'label' | 'tourRef' | 'onNavigate' | 'onPress' | 'style'
  >;

  return (
    <View ref={tourRef} collapsable={false} className="w-full">
      <Pressable
        {...pressableProps}
        onPress={(event) => {
          onPress?.(event);
          onNavigate?.();
        }}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: Boolean(isFocused) }}
        style={(state) => [
          typeof style === 'function' ? style(state) : style,
          { justifyContent: 'flex-start' },
        ]}
        className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex-row items-center ${
          isFocused
            ? 'bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200/70 dark:border-ledger-border-dark'
            : 'border border-transparent hover:bg-ledger-selected/70 dark:hover:bg-ledger-selected-dark active:opacity-75'
        }`}>
        <ThemedText
          className={`text-sm ${
            isFocused
              ? 'font-semibold text-brand-500 dark:text-brand-400'
              : 'font-medium text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary'
          }`}>
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

type SidebarTabListProps = TabListProps & {
  isDesktop: boolean;
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onNavScroll?: () => void;
};

export function SidebarTabList({
  style,
  children,
  isDesktop,
  isOpen,
  onClose,
  onStartTour,
  onNavScroll,
  ...restProps
}: SidebarTabListProps) {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const avatarInitial = (user?.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();

  const handleSignOut = async () => {
    onClose();
    try {
      await logout();
      router.replace('/');
    } catch (_error: unknown) {
      router.replace('/');
    }
  };

  const innerContent = (
    <>
      {/* Brand Header */}
      <View className="px-4 pt-5 pb-4 border-b border-ledger-border dark:border-ledger-border-dark flex-row items-center justify-between gap-2">
        <View className="flex-1 min-w-0">
          <ThemedText
            className="text-sm font-bold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
            numberOfLines={1}>
            Budget Tracker
          </ThemedText>
          <ThemedText
            className="text-xs text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
            numberOfLines={1}>
            Personal Ledger
          </ThemedText>
        </View>

        {!isDesktop && (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            className="min-h-[44px] px-3 rounded-xl bg-ledger-surface dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75">
            <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Close
            </ThemedText>
          </Pressable>
        )}
      </View>

      {/* Navigation Links */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={onNavScroll}
        onScrollEndDrag={onNavScroll}
        onMomentumScrollEnd={onNavScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16, gap: 4 }}>
        {children}
      </ScrollView>

      {/* Account & Sign Out Footer */}
      <View className="p-3 border-t border-ledger-border dark:border-ledger-border-dark gap-2.5">
        <View className="items-start">
          <SyncStatusBadge />
        </View>

        <Pressable
          onPress={onStartTour}
          accessibilityRole="button"
          accessibilityLabel="Start Quick Tour"
          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark flex-row items-center gap-2 active:opacity-75">
          <AppIcon name="sparkle" size={16} color={theme.primary} />
          <ThemedText className="flex-1 text-xs font-semibold text-brand-500 dark:text-brand-400">
            Quick Tour
          </ThemedText>
          <AppIcon name="chevronRight" size={14} color={theme.primary} />
        </Pressable>

        <View className="px-3 py-2.5 rounded-xl bg-ledger-surface dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center shrink-0">
            <ThemedText className="text-xs font-bold text-brand-500 dark:text-brand-400">
              {avatarInitial}
            </ThemedText>
          </View>
          <View className="flex-1 min-w-0">
            <ThemedText
              className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark"
              numberOfLines={1}>
              {user?.name ?? 'Signed in'}
            </ThemedText>
            <ThemedText
              className="text-[11px] text-ledger-ink-muted dark:text-ledger-ink-dark-muted"
              numberOfLines={1}>
              {user?.email ?? 'User'}
            </ThemedText>
          </View>
        </View>

        <Pressable
          onPress={() => {
            void handleSignOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-ledger-border dark:border-ledger-border-dark bg-ledger-surface dark:bg-ledger-subtle-dark flex-row items-center justify-center active:opacity-75">
          <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
            Sign Out
          </ThemedText>
        </Pressable>
      </View>
    </>
  );

  return (
    <View
      {...restProps}
      accessibilityViewIsModal={!isDesktop && isOpen}
      style={StyleSheet.flatten([
        style,
        isDesktop
          ? {
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: 248,
              flexShrink: 0,
              height: '100%',
            }
          : {
              flexDirection: 'column',
              justifyContent: 'space-between',
              width: 268,
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 50,
              display: isOpen ? 'flex' : 'none',
            },
      ])}
      className="bg-ledger-subtle dark:bg-ledger-surface-dark border-r border-ledger-border dark:border-ledger-border-dark">
      {isDesktop ? (
        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          {innerContent}
        </View>
      ) : (
        <SafeAreaView
          edges={['top', 'bottom', 'left']}
          style={{ flex: 1, justifyContent: 'space-between' }}>
          {innerContent}
        </SafeAreaView>
      )}
    </View>
  );
}

function HamburgerIcon({ color }: { color: string }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="w-[18px] h-[14px] justify-between">
      <View
        className="w-full h-[2px] rounded-full"
        style={{ backgroundColor: color }}
      />
      <View
        className="w-full h-[2px] rounded-full"
        style={{ backgroundColor: color }}
      />
      <View
        className="w-full h-[2px] rounded-full"
        style={{ backgroundColor: color }}
      />
    </View>
  );
}
