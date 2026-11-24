import {
  applySyncMutations,
  createInitialSyncDataState,
  syncDataStateSchema,
  syncMutationSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type SyncDataState,
  type SyncMutation,
} from '@repo/contracts';
import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { ApiClientError, apiFetch } from '@/common/lib/api-client';
import { getItemSync, removeItemSync, setItemSync } from '@/common/lib/kv-storage';
import { getAuthToken, isCookieAuthMode } from '@/common/lib/token-storage';

const CLOUD_CACHE_PREFIX = 'budget_tracker_v4_cloud:';
const MAX_SYNC_BATCH = 500;

const cloudCacheEnvelopeSchema = z.object({
  serverRevision: z.number().int().nonnegative(),
  serverState: syncDataStateSchema,
  pendingMutations: z.array(syncMutationSchema),
  lastSyncedAt: z.string().nullable(),
});
type CloudCacheEnvelope = z.infer<typeof cloudCacheEnvelopeSchema>;

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncStatusSnapshot {
  phase: SyncPhase;
  pendingCount: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  serverRevision: number;
}

let sessionGeneration = 0;
let activeUserId: string | null = null;
let activeEnvelope: CloudCacheEnvelope = {
  serverRevision: 0,
  serverState: createInitialSyncDataState(),
  pendingMutations: [],
  lastSyncedAt: null,
};
let activeComputedState: SyncDataState = activeEnvelope.serverState;

let statusSnapshot: SyncStatusSnapshot = {
  phase: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  errorMessage: null,
  serverRevision: 0,
};

const statusListeners = new Set<() => void>();
let onRemoteStateUpdatedCallback: (() => void) | null = null;
let onUnauthorizedCallback: (() => void) | null = null;
let inFlightSync: Promise<void> | null = null;
let pendingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function getCacheKey(userId: string): string {
  return `${CLOUD_CACHE_PREFIX}${userId}`;
}

function updateStatus(patch: Partial<SyncStatusSnapshot>): void {
  const next: SyncStatusSnapshot = {
    ...statusSnapshot,
    ...patch,
    pendingCount: activeUserId ? activeEnvelope.pendingMutations.length : 0,
    lastSyncedAt: activeUserId ? activeEnvelope.lastSyncedAt : null,
    serverRevision: activeUserId ? activeEnvelope.serverRevision : 0,
  };
  if (
    next.phase === statusSnapshot.phase &&
    next.pendingCount === statusSnapshot.pendingCount &&
    next.lastSyncedAt === statusSnapshot.lastSyncedAt &&
    next.errorMessage === statusSnapshot.errorMessage &&
    next.serverRevision === statusSnapshot.serverRevision
  ) {
    return;
  }
  statusSnapshot = next;
  for (const listener of statusListeners) {
    listener();
  }
}

function saveEnvelope(userId: string, envelope: CloudCacheEnvelope): void {
  setItemSync(getCacheKey(userId), JSON.stringify(envelope));
}

function loadEnvelope(userId: string): CloudCacheEnvelope {
  const raw = getItemSync(getCacheKey(userId));
  if (raw) {
    try {
      const parsed = cloudCacheEnvelopeSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success) {
        return parsed.data;
      }
    } catch (error: unknown) {
      // Fallback to fresh local envelope
    }
  }
  const fresh: CloudCacheEnvelope = {
    serverRevision: 0,
    serverState: createInitialSyncDataState(),
    pendingMutations: [],
    lastSyncedAt: null,
  };
  saveEnvelope(userId, fresh);
  return fresh;
}

export function clearSyncCacheForUser(userId: string): void {
  removeItemSync(getCacheKey(userId));
}

export function registerSyncHandlers(handlers: {
  onRemoteStateUpdated?: () => void;
  onUnauthorized?: () => void;
}): () => void {
  onRemoteStateUpdatedCallback = handlers.onRemoteStateUpdated ?? null;
  onUnauthorizedCallback = handlers.onUnauthorized ?? null;
  return () => {
    onRemoteStateUpdatedCallback = null;
    onUnauthorizedCallback = null;
  };
}

export function setActiveSyncUser(userId: string | null): void {
  sessionGeneration += 1;
  if (pendingDebounceTimer !== null) {
    clearTimeout(pendingDebounceTimer);
    pendingDebounceTimer = null;
  }

  activeUserId = userId;
  if (!userId) {
    activeEnvelope = {
      serverRevision: 0,
      serverState: createInitialSyncDataState(),
      pendingMutations: [],
      lastSyncedAt: null,
    };
    activeComputedState = activeEnvelope.serverState;
    updateStatus({
      phase: 'idle',
      errorMessage: null,
    });
    return;
  }

  activeEnvelope = loadEnvelope(userId);
  activeComputedState = applySyncMutations(
    activeEnvelope.serverState,
    activeEnvelope.pendingMutations,
  );
  updateStatus({
    phase:
      activeEnvelope.pendingMutations.length > 0
        ? 'offline'
        : activeEnvelope.lastSyncedAt
          ? 'synced'
          : 'idle',
    errorMessage: null,
  });
}

export function getActiveSyncUserId(): string | null {
  return activeUserId;
}

export function getCurrentSyncRevision(): number {
  return activeEnvelope.serverRevision;
}

export function getCurrentSyncState(): SyncDataState {
  return activeComputedState;
}

export function createSyncOpId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function scheduleSync(delayMs = 150): void {
  if (!activeUserId) {
    return;
  }
  if (pendingDebounceTimer !== null) {
    clearTimeout(pendingDebounceTimer);
  }
  pendingDebounceTimer = setTimeout(() => {
    pendingDebounceTimer = null;
    void syncNow();
  }, delayMs);
}

export function enqueueSyncMutation(mutation: SyncMutation): SyncDataState {
  const validated = syncMutationSchema.parse(mutation);
  activeEnvelope = {
    ...activeEnvelope,
    pendingMutations: [...activeEnvelope.pendingMutations, validated],
  };
  activeComputedState = applySyncMutations(
    activeEnvelope.serverState,
    activeEnvelope.pendingMutations,
  );

  if (activeUserId) {
    saveEnvelope(activeUserId, activeEnvelope);
    updateStatus({
      phase: statusSnapshot.phase === 'syncing' ? 'syncing' : 'idle',
      errorMessage: null,
    });
    scheduleSync(150);
  }

  return activeComputedState;
}

async function performSyncPass(allowConflictRetry = true): Promise<void> {
  const syncUserId = activeUserId;
  const syncGeneration = sessionGeneration;
  if (!syncUserId) {
    return;
  }

  const token = await getAuthToken();
  if (
    (!isCookieAuthMode() && !token) ||
    activeUserId !== syncUserId ||
    sessionGeneration !== syncGeneration
  ) {
    return;
  }

  updateStatus({ phase: 'syncing', errorMessage: null });

  try {
    if (activeEnvelope.pendingMutations.length > 0) {
      const batch = activeEnvelope.pendingMutations.slice(0, MAX_SYNC_BATCH);
      try {
        const pushRes = await apiFetch('/v1/sync', syncPushResponseSchema, {
          method: 'POST',
          body: JSON.stringify({
            lastKnownRevision: activeEnvelope.serverRevision,
            mutations: batch,
          }),
        });

        if (
          activeUserId !== syncUserId ||
          sessionGeneration !== syncGeneration
        ) {
          return;
        }

        const appliedSet = new Set(pushRes.appliedOpIds);
        const remainingPending = activeEnvelope.pendingMutations.filter(
          (m) => !appliedSet.has(m.opId),
        );

        activeEnvelope = {
          serverRevision: pushRes.revision,
          serverState: pushRes.state,
          pendingMutations: remainingPending,
          lastSyncedAt: pushRes.serverTime,
        };
        activeComputedState = applySyncMutations(
          activeEnvelope.serverState,
          activeEnvelope.pendingMutations,
        );
        saveEnvelope(syncUserId, activeEnvelope);
        onRemoteStateUpdatedCallback?.();

        if (remainingPending.length > 0) {
          await performSyncPass();
          return;
        }

        updateStatus({ phase: 'synced', errorMessage: null });
        return;
      } catch (pushError: unknown) {
        if (
          activeUserId !== syncUserId ||
          sessionGeneration !== syncGeneration
        ) {
          return;
        }
        if (pushError instanceof ApiClientError && pushError.status === 409 && allowConflictRetry) {
          const pullRes = await apiFetch(
            `/v1/sync?sinceRevision=${activeEnvelope.serverRevision}`,
            syncPullResponseSchema,
            { method: 'GET' },
          );
          if (
            activeUserId !== syncUserId ||
            sessionGeneration !== syncGeneration
          ) {
            return;
          }
          if (!pullRes.unchanged && pullRes.state) {
            activeEnvelope = {
              ...activeEnvelope,
              serverRevision: pullRes.revision,
              serverState: pullRes.state,
              lastSyncedAt: pullRes.serverTime,
            };
          } else {
            activeEnvelope = {
              ...activeEnvelope,
              serverRevision: pullRes.revision,
              lastSyncedAt: pullRes.serverTime,
            };
          }
          activeComputedState = applySyncMutations(
            activeEnvelope.serverState,
            activeEnvelope.pendingMutations,
          );
          saveEnvelope(syncUserId, activeEnvelope);
          onRemoteStateUpdatedCallback?.();
          await performSyncPass(false);
          return;
        }
        if (pushError instanceof ApiClientError && pushError.status === 400) {
          // Quarantine permanently invalid batch mutations so future edits are not blocked forever
          const badOpIds = new Set(batch.map((m) => m.opId));
          const remaining = activeEnvelope.pendingMutations.filter(
            (m) => !badOpIds.has(m.opId),
          );
          activeEnvelope = {
            ...activeEnvelope,
            pendingMutations: remaining,
          };
          activeComputedState = applySyncMutations(
            activeEnvelope.serverState,
            activeEnvelope.pendingMutations,
          );
          saveEnvelope(syncUserId, activeEnvelope);
          onRemoteStateUpdatedCallback?.();
          updateStatus({
            phase: 'error',
            errorMessage: `Dropped invalid sync change: ${pushError.message}`,
          });
          return;
        }
        throw pushError;
      }
    }

    const pullRes = await apiFetch(
      `/v1/sync?sinceRevision=${activeEnvelope.serverRevision}`,
      syncPullResponseSchema,
      { method: 'GET' },
    );

    if (
      activeUserId !== syncUserId ||
      sessionGeneration !== syncGeneration
    ) {
      return;
    }

    if (!pullRes.unchanged && pullRes.state) {
      activeEnvelope = {
        ...activeEnvelope,
        serverRevision: pullRes.revision,
        serverState: pullRes.state,
        lastSyncedAt: pullRes.serverTime,
      };
      activeComputedState = applySyncMutations(
        activeEnvelope.serverState,
        activeEnvelope.pendingMutations,
      );
      saveEnvelope(syncUserId, activeEnvelope);
      onRemoteStateUpdatedCallback?.();
    } else {
      activeEnvelope = {
        ...activeEnvelope,
        serverRevision: pullRes.revision,
        lastSyncedAt: pullRes.serverTime,
      };
      saveEnvelope(syncUserId, activeEnvelope);
    }

    if (activeEnvelope.pendingMutations.length > 0) {
      await performSyncPass();
      return;
    }

    updateStatus({ phase: 'synced', errorMessage: null });
  } catch (error: unknown) {
    if (
      activeUserId !== syncUserId ||
      sessionGeneration !== syncGeneration
    ) {
      return;
    }

    if (error instanceof ApiClientError) {
      if (error.status === 401) {
        updateStatus({ phase: 'error', errorMessage: 'Session expired.' });
        onUnauthorizedCallback?.();
        return;
      }
      if (error.isNetworkError) {
        updateStatus({
          phase: 'offline',
          errorMessage: 'Offline — changes saved locally.',
        });
        return;
      }
      updateStatus({
        phase: 'error',
        errorMessage: error.message,
      });
      return;
    }

    updateStatus({
      phase: 'offline',
      errorMessage: 'Unable to reach sync server.',
    });
  }
}

export async function syncNow(): Promise<void> {
  if (!activeUserId) {
    return;
  }
  if (pendingDebounceTimer !== null) {
    clearTimeout(pendingDebounceTimer);
    pendingDebounceTimer = null;
  }
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = performSyncPass().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getSyncStatusSnapshot(): SyncStatusSnapshot {
  return statusSnapshot;
}

export function useSyncStatus(): SyncStatusSnapshot {
  return useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatusSnapshot,
    getSyncStatusSnapshot,
  );
}
