/**
 * Ride lifecycle (Section 3 suggested lifecycle, adopted as-is - it already
 * covers every state the brief asks for and maps cleanly onto driver
 * actions: accept -> arrive -> start -> complete):
 *
 *   REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED
 *   REQUESTED | MATCHED | DRIVER_ARRIVED -> CANCELLED
 *
 * CANCELLED is reachable from any pre-STARTED state (a passenger can cancel
 * up until the trip physically starts) but not from STARTED/COMPLETED -
 * once a Tesla is moving, the correct terminal action is COMPLETED, and a
 * cancellation after that point would need a separate refund/dispute flow,
 * not a state transition (documented as a known limitation in the README).
 */

export type RideStatus =
  | 'REQUESTED'
  | 'MATCHED'
  | 'DRIVER_ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

const TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid ride state transition: ${from} -> ${to}`);
  }
}

export function isCancellable(status: RideStatus): boolean {
  return canTransition(status, 'CANCELLED');
}
