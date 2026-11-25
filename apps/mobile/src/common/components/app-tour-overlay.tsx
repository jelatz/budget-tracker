import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/common/hooks/use-theme';
import { useTourKeyboard } from '@/common/hooks/use-tour-keyboard';
import {
  computeCursorAnchor,
  computeSpotlightRect,
  computeTooltipLayout,
  type Rect,
  type TooltipLayout,
  type TourTargetId,
} from '@/common/lib/tour-geometry';
import { AppIcon, type AppIconName } from './app-icon';
import { ThemedText } from './themed-text';

export type TourRoute =
  | '/dashboard'
  | '/accounts'
  | '/expenses'
  | '/transactions'
  | '/history'
  | '/reconciliation'
  | '/portability';

export interface TourStep {
  id: string;
  targetId: TourTargetId;
  title: string;
  subtitle: string;
  icon: AppIconName;
  route?: TourRoute;
  highlights: readonly string[];
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'dashboard',
    targetId: 'nav-dashboard',
    title: 'Your Financial Snapshot',
    subtitle: 'See your safe daily spending limit and overall health at a glance.',
    icon: 'dashboard',
    route: '/dashboard',
    highlights: [
      'Safe to Spend subtracts upcoming fixed bills, remaining budgets, and sinking funds from liquid cash.',
      'Net Worth, Cashflow, Accounts, and Tag insights update live as you log entries.',
      'Switch between This Month, Last 7 Days, and All Time from the top bar.',
    ],
  },
  {
    id: 'quick-add',
    targetId: 'fab-quick-add',
    title: 'Quick-Add Anywhere (+)',
    subtitle: 'Tap the floating + button at the bottom-right corner on any screen.',
    icon: 'add',
    highlights: [
      'Record Outgoing expenses, Incoming payouts, or Account Transfers without leaving your page.',
      'Split one receipt across multiple categories or attach #tags and notes for fast search.',
    ],
  },
  {
    id: 'accounts',
    targetId: 'nav-accounts',
    title: 'Accounts, Income & Sinking Funds',
    subtitle: 'Keep your balances, paydays, and savings goals together in one place.',
    icon: 'accounts',
    route: '/accounts',
    highlights: [
      'Track Bank, E-Wallet, Cash, and Credit Card balances side by side.',
      'Income Sources tracks Received vs. Expected pay with 1-tap Log Payday.',
      'Sinking Funds lets you set aside savings targets isolated from Safe to Spend.',
    ],
  },
  {
    id: 'expenses',
    targetId: 'nav-expenses',
    title: 'Expenses, Bills & Budgets',
    subtitle: 'Stay ahead of recurring bills, installments, and monthly limits.',
    icon: 'expenses',
    route: '/expenses',
    highlights: [
      'Recorded lets you review and edit day-to-day spending in cards or table view.',
      'Recurring & Loans filters by All, Unpaid, Upcoming, and Paid with Pay & Deduct or Pay Early.',
      'Budgets tracks your monthly target and Category Envelopes with optional rollover.',
    ],
  },
  {
    id: 'transactions',
    targetId: 'nav-transactions',
    title: 'Full Transactions Ledger',
    subtitle: 'Inspect every movement across accounts with fast filtering.',
    icon: 'capture',
    route: '/transactions',
    highlights: [
      'Filter by period, account, type (Incoming, Outgoing, Transfer), or search text.',
      'Edit, split, or delete any entry while account balances stay synchronized.',
    ],
  },
  {
    id: 'history',
    targetId: 'nav-history',
    title: 'Activity History Stream',
    subtitle: 'Browse a chronological feed across all accounts and #tags.',
    icon: 'history',
    route: '/history',
    highlights: [
      'Review recent spending, income, and transfers in a clean timeline.',
      'Quickly trace past adjustments, recurring bill payments, and tagged receipts.',
    ],
  },
  {
    id: 'reconciliation',
    targetId: 'nav-reconciliation',
    title: 'Balance Reconciliation',
    subtitle: 'Keep app balances matched to your real bank statements.',
    icon: 'reconcile',
    route: '/reconciliation',
    highlights: [
      'Enter your actual bank or wallet balance to detect any discrepancy.',
      'Automatically post a reconciliation adjustment entry or update the balance directly.',
    ],
  },
  {
    id: 'portability',
    targetId: 'nav-portability',
    title: 'Backup, Export & Replay',
    subtitle: 'Keep your data portable or revisit this walkthrough anytime.',
    icon: 'portability',
    route: '/portability',
    highlights: [
      'Download or restore full JSON backups and export CSV spreadsheets.',
      'Need a refresher later? Tap Quick Tour right above your profile in the sidebar.',
    ],
  },
];

export interface AppTourOverlayProps {
  visible: boolean;
  isDesktop: boolean;
  activeStepIndex: number;
  onStepChange: (nextIndex: number) => void;
  onClose: () => void;
  targetRect: Rect | null;
}

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const CURSOR_BADGE_SIZE = 36;

export function AppTourOverlay({
  visible,
  isDesktop,
  activeStepIndex,
  onStepChange,
  onClose,
  targetRect,
}: AppTourOverlayProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  const [tooltipHeight, setTooltipHeight] = useState(260);
  const [reduceMotion, setReduceMotion] = useState(false);

  const cursorX = useRef(new Animated.Value(0)).current;
  const cursorY = useRef(new Animated.Value(0)).current;
  const cursorScale = useRef(new Animated.Value(1)).current;
  const cursorOpacity = useRef(new Animated.Value(0)).current;
  const nudgeX = useRef(new Animated.Value(0)).current;
  const nudgeY = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(0.4)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const tooltipOpacity = useRef(new Animated.Value(1)).current;

  const hasInitializedCursorRef = useRef(false);
  const lastAnimatedStepRef = useRef(-1);
  const activeSequenceRef = useRef<Animated.CompositeAnimation | null>(null);
  const idleLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const clampedIndex = Math.max(0, Math.min(TOUR_STEPS.length - 1, activeStepIndex));
  const step = TOUR_STEPS[clampedIndex] ?? TOUR_STEPS[0];
  const isFirst = clampedIndex === 0;
  const isLast = clampedIndex === TOUR_STEPS.length - 1;
  const progressPercent = Math.round(((clampedIndex + 1) * 100) / TOUR_STEPS.length);

  const goToStep = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, nextIndex));
      onStepChange(clamped);
    },
    [onStepChange],
  );

  const handleNext = useCallback(() => {
    if (isLast) {
      onClose();
    } else {
      goToStep(clampedIndex + 1);
    }
  }, [isLast, onClose, goToStep, clampedIndex]);

  const handleBack = useCallback(() => {
    if (!isFirst) {
      goToStep(clampedIndex - 1);
    }
  }, [isFirst, goToStep, clampedIndex]);

  useTourKeyboard({
    enabled: visible,
    onNext: handleNext,
    onBack: handleBack,
    onClose,
  });

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch((_error: unknown) => {
        // Keep default false when unavailable.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setReduceMotion(enabled);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // Synchronize page route right as the cursor reaches/clicks the nav item.
  useEffect(() => {
    if (!visible || !step.route) {
      return;
    }

    const targetRoute = step.route;
    const delayMs = reduceMotion ? 0 : 300;
    const timer = setTimeout(() => {
      router.push(targetRoute);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [visible, clampedIndex, step.route, reduceMotion]);

  // Subtle card fade when switching steps.
  useEffect(() => {
    if (!visible) {
      return;
    }
    if (reduceMotion) {
      tooltipOpacity.setValue(1);
      return;
    }
    tooltipOpacity.setValue(0.65);
    Animated.timing(tooltipOpacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [visible, clampedIndex, reduceMotion, tooltipOpacity]);

  const spotlightRect = useMemo(() => {
    if (!targetRect) return null;
    const padding = step.targetId === 'fab-quick-add' ? 6 : 4;
    return computeSpotlightRect(targetRect, viewportWidth, viewportHeight, padding);
  }, [targetRect, viewportWidth, viewportHeight, step.targetId]);

  const cursorAnchor = useMemo(() => {
    if (!targetRect) return null;
    return computeCursorAnchor(targetRect, step.targetId);
  }, [targetRect, step.targetId]);

  const tooltipLayout: TooltipLayout = useMemo(
    () =>
      computeTooltipLayout({
        target: spotlightRect,
        targetId: step.targetId,
        isDesktop,
        viewportWidth,
        viewportHeight,
        tooltipHeight,
        insets,
      }),
    [
      spotlightRect,
      step.targetId,
      isDesktop,
      viewportWidth,
      viewportHeight,
      tooltipHeight,
      insets,
    ],
  );

  const stopAnimations = useCallback(() => {
    activeSequenceRef.current?.stop();
    activeSequenceRef.current = null;
    idleLoopRef.current?.stop();
    idleLoopRef.current = null;
  }, []);

  const targetAnchorX = cursorAnchor?.x ?? null;
  const targetAnchorY = cursorAnchor?.y ?? null;
  const lastTargetPosRef = useRef<{ x: number; y: number } | null>(null);

  // Reset cursor state whenever the tour closes.
  useEffect(() => {
    if (!visible) {
      stopAnimations();
      hasInitializedCursorRef.current = false;
      lastAnimatedStepRef.current = -1;
      lastTargetPosRef.current = null;
      cursorOpacity.setValue(0);
      cursorScale.setValue(1);
      nudgeX.setValue(0);
      nudgeY.setValue(0);
      rippleOpacity.setValue(0);
    }
  }, [
    visible,
    stopAnimations,
    cursorOpacity,
    cursorScale,
    nudgeX,
    nudgeY,
    rippleOpacity,
  ]);

  // Animate cursor glide -> click pulse + ripple -> subtle idle nudge.
  useEffect(() => {
    if (!visible || targetAnchorX === null || targetAnchorY === null) {
      return;
    }

    const startIdleNudge = () => {
      if (reduceMotion) return;
      idleLoopRef.current?.stop();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(nudgeX, {
              toValue: 3,
              duration: 900,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(nudgeY, {
              toValue: -2,
              duration: 900,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
          Animated.parallel([
            Animated.timing(nudgeX, {
              toValue: 0,
              duration: 900,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(nudgeY, {
              toValue: 0,
              duration: 900,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]),
        ]),
      );
      idleLoopRef.current = loop;
      loop.start();
    };

    if (reduceMotion) {
      stopAnimations();
      hasInitializedCursorRef.current = true;
      lastAnimatedStepRef.current = clampedIndex;
      lastTargetPosRef.current = { x: targetAnchorX, y: targetAnchorY };
      cursorX.setValue(targetAnchorX);
      cursorY.setValue(targetAnchorY);
      cursorOpacity.setValue(1);
      cursorScale.setValue(1);
      nudgeX.setValue(0);
      nudgeY.setValue(0);
      rippleOpacity.setValue(0);
      return;
    }

    const isFirstAppear = !hasInitializedCursorRef.current;
    const isNewStep = lastAnimatedStepRef.current !== clampedIndex;
    const prevPos = lastTargetPosRef.current;
    const posUnchanged =
      prevPos !== null &&
      Math.abs(prevPos.x - targetAnchorX) < 0.5 &&
      Math.abs(prevPos.y - targetAnchorY) < 0.5;

    if (!isFirstAppear && !isNewStep) {
      if (posUnchanged) {
        return;
      }
      lastTargetPosRef.current = { x: targetAnchorX, y: targetAnchorY };
      Animated.parallel([
        Animated.timing(cursorX, {
          toValue: targetAnchorX,
          duration: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(cursorY, {
          toValue: targetAnchorY,
          duration: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
      return;
    }

    stopAnimations();
    hasInitializedCursorRef.current = true;
    lastAnimatedStepRef.current = clampedIndex;
    lastTargetPosRef.current = { x: targetAnchorX, y: targetAnchorY };

    if (isFirstAppear) {
      cursorX.setValue(targetAnchorX + 28);
      cursorY.setValue(targetAnchorY + 22);
      cursorOpacity.setValue(0);
    }
    cursorScale.setValue(1);
    nudgeX.setValue(0);
    nudgeY.setValue(0);
    rippleScale.setValue(0.4);
    rippleOpacity.setValue(0);

    const glideDuration = isFirstAppear ? 340 : 400;
    const glide = Animated.parallel([
      Animated.timing(cursorOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cursorX, {
        toValue: targetAnchorX,
        duration: glideDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(cursorY, {
        toValue: targetAnchorY,
        duration: glideDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);

    const clickAndRipple = Animated.parallel([
      Animated.sequence([
        Animated.timing(cursorScale, {
          toValue: 0.82,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(cursorScale, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
      Animated.sequence([
        Animated.timing(rippleOpacity, {
          toValue: 0.65,
          duration: 40,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.parallel([
          Animated.timing(rippleScale, {
            toValue: 1.9,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(rippleOpacity, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
      ]),
    ]);

    const sequence = Animated.sequence([glide, clickAndRipple]);
    activeSequenceRef.current = sequence;
    sequence.start(({ finished }) => {
      if (finished) {
        startIdleNudge();
      }
    });
  }, [
    visible,
    targetAnchorX,
    targetAnchorY,
    clampedIndex,
    reduceMotion,
    stopAnimations,
    cursorX,
    cursorY,
    cursorScale,
    cursorOpacity,
    nudgeX,
    nudgeY,
    rippleScale,
    rippleOpacity,
  ]);

  if (!visible) {
    return null;
  }

  const renderCaret = () => {
    if (tooltipLayout.placement === 'center') {
      return null;
    }

    const baseStyle = {
      position: 'absolute' as const,
      width: 12,
      height: 12,
      backgroundColor: theme.surface,
      borderColor: theme.borderStrong,
      transform: [{ rotate: '45deg' }],
    };

    if (tooltipLayout.placement === 'right') {
      return (
        <View
          pointerEvents="none"
          style={{
            ...baseStyle,
            left: -6,
            top: tooltipLayout.arrowOffset - 6,
            borderBottomWidth: 1,
            borderLeftWidth: 1,
          }}
        />
      );
    }

    if (tooltipLayout.placement === 'left') {
      return (
        <View
          pointerEvents="none"
          style={{
            ...baseStyle,
            right: -6,
            top: tooltipLayout.arrowOffset - 6,
            borderTopWidth: 1,
            borderRightWidth: 1,
          }}
        />
      );
    }

    if (tooltipLayout.placement === 'bottom') {
      return (
        <View
          pointerEvents="none"
          style={{
            ...baseStyle,
            top: -6,
            left: tooltipLayout.arrowOffset - 6,
            borderTopWidth: 1,
            borderLeftWidth: 1,
          }}
        />
      );
    }

    return (
      <View
        pointerEvents="none"
        style={{
          ...baseStyle,
          bottom: -6,
          left: tooltipLayout.arrowOffset - 6,
          borderBottomWidth: 1,
          borderRightWidth: 1,
        }}
      />
    );
  };

  const isFabTarget = step.targetId === 'fab-quick-add';
  const cursorTranslateX = Animated.add(
    Animated.add(cursorX, -CURSOR_BADGE_SIZE / 2),
    nudgeX,
  );
  const cursorTranslateY = Animated.add(
    Animated.add(cursorY, -CURSOR_BADGE_SIZE / 2),
    nudgeY,
  );

  return (
    <View
      accessibilityViewIsModal
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { zIndex: 100 }]}
    >
      {/* 4-pane Spotlight Scrim + Cutout Blocker */}
      {spotlightRect ? (
        <>
          <View
            pointerEvents="auto"
            className="bg-black/45"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: viewportWidth,
              height: spotlightRect.y,
            }}
          />
          <View
            pointerEvents="auto"
            className="bg-black/45"
            style={{
              position: 'absolute',
              left: 0,
              top: spotlightRect.y + spotlightRect.height,
              width: viewportWidth,
              height: Math.max(
                0,
                viewportHeight - (spotlightRect.y + spotlightRect.height),
              ),
            }}
          />
          <View
            pointerEvents="auto"
            className="bg-black/45"
            style={{
              position: 'absolute',
              left: 0,
              top: spotlightRect.y,
              width: spotlightRect.x,
              height: spotlightRect.height,
            }}
          />
          <View
            pointerEvents="auto"
            className="bg-black/45"
            style={{
              position: 'absolute',
              left: spotlightRect.x + spotlightRect.width,
              top: spotlightRect.y,
              width: Math.max(
                0,
                viewportWidth - (spotlightRect.x + spotlightRect.width),
              ),
              height: spotlightRect.height,
            }}
          />
          <View
            pointerEvents="auto"
            className={`border-2 border-brand-500 dark:border-brand-400 ${
              isFabTarget ? 'rounded-full' : 'rounded-xl'
            }`}
            style={{
              position: 'absolute',
              left: spotlightRect.x,
              top: spotlightRect.y,
              width: spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
        </>
      ) : (
        <View
          pointerEvents="auto"
          style={StyleSheet.absoluteFill}
          className="bg-black/45"
        />
      )}

      {/* Anchored Tooltip Card */}
      <Animated.View
        onLayout={(event) => {
          const measuredHeight = Math.round(event.nativeEvent.layout.height);
          if (measuredHeight > 0 && Math.abs(measuredHeight - tooltipHeight) > 2) {
            setTooltipHeight(measuredHeight);
          }
        }}
        style={{
          position: 'absolute',
          left: tooltipLayout.left,
          top: tooltipLayout.top,
          width: tooltipLayout.width,
          zIndex: 110,
          opacity: tooltipOpacity,
        }}
      >
        <View
          style={[
            {
              backgroundColor: theme.surface,
              borderColor: theme.borderStrong,
            },
            Platform.OS === 'web'
              ? {
                  boxShadow: '0 14px 36px rgba(0, 0, 0, 0.22)',
                }
              : {
                  shadowColor: theme.text,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                  elevation: 10,
                },
          ]}
          className="rounded-2xl bg-ledger-surface dark:bg-ledger-surface-dark border border-ledger-border-strong dark:border-ledger-border-strong-dark p-5 gap-3.5"
        >
          {renderCaret()}

        {/* Header Row */}
        <View className="flex-row items-center justify-between gap-2">
          <View className="px-2.5 py-1 rounded-full bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark">
            <ThemedText
              numeric
              className="text-xs font-bold text-brand-500 dark:text-brand-400"
            >
              {`Step ${clampedIndex + 1} of ${TOUR_STEPS.length}`}
            </ThemedText>
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Skip quick tour"
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
          >
            <ThemedText className="text-xs font-semibold text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
              Skip
            </ThemedText>
          </Pressable>
        </View>

        {/* Progress Bar */}
        <View className="h-1.5 rounded-full bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark overflow-hidden">
          <View
            className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
            style={{ width: `${progressPercent}%` }}
          />
        </View>

        {/* Step Body */}
        <ScrollView
          className="max-h-[210px]"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-ledger-pine-dark-soft border border-brand-200 dark:border-ledger-border-dark items-center justify-center shrink-0">
                <AppIcon name={step.icon} size={20} color={theme.primary} />
              </View>

              <View className="flex-1 min-w-0 gap-0.5">
                <ThemedText
                  accessibilityRole="header"
                  className="text-base font-extrabold tracking-tight text-ledger-ink dark:text-ledger-ink-dark"
                >
                  {step.title}
                </ThemedText>
                <ThemedText className="text-xs leading-4 text-ledger-ink-secondary dark:text-ledger-ink-dark-secondary">
                  {step.subtitle}
                </ThemedText>
              </View>
            </View>

            <View className="gap-2 p-3 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark">
              {step.highlights.map((item) => (
                <View key={item} className="flex-row items-start gap-2">
                  <View className="mt-0.5 shrink-0">
                    <AppIcon
                      name="checkCircle"
                      size={14}
                      color={theme.positive}
                    />
                  </View>
                  <ThemedText className="flex-1 text-xs leading-4 text-ledger-ink dark:text-ledger-ink-dark">
                    {item}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Step Dots */}
        <View className="flex-row items-center justify-center gap-1.5">
          {TOUR_STEPS.map((item, idx) => {
            const isActive = idx === clampedIndex;
            return (
              <Pressable
                key={item.id}
                onPress={() => goToStep(idx)}
                accessibilityRole="button"
                accessibilityLabel={`Go to step ${idx + 1}: ${item.title}`}
                accessibilityState={{ selected: isActive }}
                hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
                className={`h-2 rounded-full ${
                  isActive
                    ? 'w-5 bg-brand-500 dark:bg-brand-400'
                    : 'w-2 bg-ledger-border-strong dark:bg-ledger-border-strong-dark active:opacity-75'
                }`}
              />
            );
          })}
        </View>

        {/* Footer Controls */}
        <View className="flex-row items-center justify-between gap-2 pt-2 border-t border-ledger-border dark:border-ledger-border-dark">
          {!isFirst ? (
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Previous tour step"
              className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-ledger-subtle dark:bg-ledger-subtle-dark border border-ledger-border dark:border-ledger-border-dark items-center justify-center active:opacity-75"
            >
              <ThemedText className="text-xs font-semibold text-ledger-ink dark:text-ledger-ink-dark">
                Back
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}

          <Pressable
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Finish quick tour' : 'Next tour step'}
            className="min-h-[44px] min-w-[44px] px-5 rounded-xl bg-brand-500 active:bg-brand-600 dark:bg-brand-400 items-center justify-center"
          >
            <ThemedText className="text-xs font-bold text-ledger-canvas dark:text-brand-900">
              {isLast ? 'Done' : 'Next'}
            </ThemedText>
          </Pressable>
        </View>
        </View>
      </Animated.View>

      {/* Animated Pointer Cursor & Click Ripple */}
      {cursorAnchor ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CURSOR_BADGE_SIZE,
            height: CURSOR_BADGE_SIZE,
            zIndex: 120,
            opacity: cursorOpacity,
            transform: [
              { translateX: cursorTranslateX },
              { translateY: cursorTranslateY },
              { scale: cursorScale },
            ],
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: CURSOR_BADGE_SIZE,
              height: CURSOR_BADGE_SIZE,
              borderRadius: CURSOR_BADGE_SIZE / 2,
              borderWidth: 2,
              borderColor: theme.primary,
              opacity: rippleOpacity,
              transform: [{ scale: rippleScale }],
            }}
          />
          <View
            style={[
              {
                width: CURSOR_BADGE_SIZE,
                height: CURSOR_BADGE_SIZE,
                backgroundColor: theme.surface,
                borderColor: theme.primary,
              },
              Platform.OS === 'web'
                ? {
                    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.24)',
                  }
                : {
                    shadowColor: theme.text,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.24,
                    shadowRadius: 6,
                    elevation: 8,
                  },
            ]}
            className="rounded-full bg-ledger-surface dark:bg-ledger-surface-dark border-2 border-brand-500 dark:border-brand-400 items-center justify-center"
          >
            <AppIcon name="cursor" size={18} color={theme.primary} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
