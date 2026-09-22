/**
 * Pool lifecycle, the driver-side counterpart to domain/stateMachine.ts.
 *
 *   FORMING -> ACCEPTED -> ACTIVE -> COMPLETED
 *   FORMING | ACCEPTED -> CANCELLED
 *
 * Why an explicit ACCEPTED step rather than jumping FORMING -> ACTIVE:
 * Section 3 lists "accept a ride/pool" as a driver capability, and with
 * auto-matching alone that step doesn't exist anywhere in the system - the
 * passenger's request is silently assumed by whichever Tesla the matcher picked.
 * Making it explicit also encodes a real pooling rule: while a pool is FORMING
 * more riders may join it (that is what makes Nusrat + Rafiq into one trip), but
 * once the driver has committed, the pool is locked and latecomers must open a
 * new pool instead of changing a trip the driver already agreed to drive.
 *
 * Kept pure (no DB/HTTP) so the transition rules are unit-testable, same as the
 * ride state machine.
 */

export type PoolStatus = 'FORMING' | 'ACCEPTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

const POOL_TRANSITIONS: Record<PoolStatus, PoolStatus[]> = {
  FORMING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionPool(from: PoolStatus, to: PoolStatus): boolean {
  return POOL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPoolTransition(from: PoolStatus, to: PoolStatus): void {
  if (!canTransitionPool(from, to)) {
    throw new Error(`Invalid pool state transition: ${from} -> ${to}`);
  }
}

/** A driver can only accept a pool that is still forming (and therefore still open to riders). */
export function canAcceptPool(status: PoolStatus): boolean {
  return canTransitionPool(status, 'ACCEPTED');
}

export function canMarkArrived(poolStatus: PoolStatus): boolean {
  return poolStatus === 'ACCEPTED';
}

export function canStartTrip(poolStatus: PoolStatus): boolean {
  return poolStatus === 'ACCEPTED';
}

export function canCompleteTrip(poolStatus: PoolStatus): boolean {
  return poolStatus === 'ACTIVE';
}

/** True while the pool can still absorb more compatible ride requests. */
export function isOpenForPooling(status: PoolStatus): boolean {
  return status === 'FORMING';
}
