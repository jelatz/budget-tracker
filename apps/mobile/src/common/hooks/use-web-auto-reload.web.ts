import { useEffect } from 'react';
import { getSyncStatusSnapshot } from '@/features/transactions/sync-engine';

const CURRENT_BUILD_ID = process.env.EXPO_PUBLIC_BUILD_ID?.trim() ?? '';
const CHECK_INTERVAL_MS = 60_000;
const MIN_CHECK_GAP_MS = 10_000;
const INITIAL_CHECK_DELAY_MS = 2_000;
const RELOAD_GUARD_KEY = 'budget_tracker_reloaded_build_id';

function isTextInputFocused(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const active = document.activeElement;
  if (!active) {
    return false;
  }
  const tag = active.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    return true;
  }
  return active instanceof HTMLElement && active.isContentEditable;
}

function readReloadGuard(): string | null {
  try {
    return window.sessionStorage.getItem(RELOAD_GUARD_KEY);
  } catch (error: unknown) {
    return null;
  }
}

function writeReloadGuard(buildId: string): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, buildId);
  } catch (error: unknown) {
    // Ignore restricted storage environments (e.g. private browsing).
  }
}

export function useWebAutoReload(): void {
  useEffect(() => {
    if (
      !CURRENT_BUILD_ID ||
      typeof window === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let lastCheckAt = 0;

    async function checkForUpdate() {
      if (cancelled || inFlight || document.visibilityState === 'hidden') {
        return;
      }

      const now = Date.now();
      if (now - lastCheckAt < MIN_CHECK_GAP_MS) {
        return;
      }

      inFlight = true;
      lastCheckAt = now;

      try {
        const res = await fetch(`/version.json?t=${now}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          return;
        }

        const data: unknown = await res.json();
        if (
          !data ||
          typeof data !== 'object' ||
          !('buildId' in data) ||
          typeof data.buildId !== 'string'
        ) {
          return;
        }

        const remoteBuildId = data.buildId.trim();
        if (!remoteBuildId || remoteBuildId === CURRENT_BUILD_ID) {
          return;
        }

        if (readReloadGuard() === remoteBuildId) {
          return;
        }

        if (getSyncStatusSnapshot().pendingCount > 0 || isTextInputFocused()) {
          return;
        }

        writeReloadGuard(remoteBuildId);
        window.location.reload();
      } catch (error: unknown) {
        // Ignore transient offline or network failures; retry on next trigger.
      } finally {
        inFlight = false;
      }
    }

    const initialTimer = setTimeout(() => {
      void checkForUpdate();
    }, INITIAL_CHECK_DELAY_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    };

    const onFocus = () => {
      void checkForUpdate();
    };

    const onPageShow = () => {
      void checkForUpdate();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);

    const intervalId = setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}
