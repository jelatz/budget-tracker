import {
  getItemSync,
  removeItemSync,
  setItemSync,
} from './kv-storage';

const TOUR_PENDING_PREFIX = 'budget_tracker_tour_pending_v1:';
const TOUR_COMPLETED_PREFIX = 'budget_tracker_tour_completed_v1:';

export function markTourPendingForNewUser(userId: string): void {
  if (!userId) return;
  setItemSync(`${TOUR_PENDING_PREFIX}${userId}`, '1');
  removeItemSync(`${TOUR_COMPLETED_PREFIX}${userId}`);
}

export function shouldAutoStartTour(userId: string): boolean {
  if (!userId) return false;
  const isPending = getItemSync(`${TOUR_PENDING_PREFIX}${userId}`) === '1';
  const isCompleted = getItemSync(`${TOUR_COMPLETED_PREFIX}${userId}`) === '1';
  return isPending && !isCompleted;
}

export function markTourCompleted(userId: string): void {
  if (!userId) return;
  removeItemSync(`${TOUR_PENDING_PREFIX}${userId}`);
  setItemSync(`${TOUR_COMPLETED_PREFIX}${userId}`, '1');
}
