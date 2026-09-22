import {
  assertPoolTransition,
  canAcceptPool,
  canCompleteTrip,
  canMarkArrived,
  canStartTrip,
  canTransitionPool,
  isOpenForPooling,
} from '../domain/poolStateMachine';

describe('pool lifecycle (driver side)', () => {
  it('allows the happy path FORMING -> ACCEPTED -> ACTIVE -> COMPLETED', () => {
    expect(canAcceptPool('FORMING')).toBe(true);
    expect(canTransitionPool('FORMING', 'ACCEPTED')).toBe(true);
    expect(canTransitionPool('ACCEPTED', 'ACTIVE')).toBe(true);
    expect(canTransitionPool('ACTIVE', 'COMPLETED')).toBe(true);
  });

  it('refuses to accept a pool twice, or one already under way', () => {
    expect(canAcceptPool('ACCEPTED')).toBe(false);
    expect(canAcceptPool('ACTIVE')).toBe(false);
    expect(canAcceptPool('COMPLETED')).toBe(false);
    expect(canAcceptPool('CANCELLED')).toBe(false);
  });

  it('refuses to arrive or start before the driver has accepted the pool', () => {
    expect(canMarkArrived('FORMING')).toBe(false);
    expect(canStartTrip('FORMING')).toBe(false);
    expect(canMarkArrived('ACCEPTED')).toBe(true);
    expect(canStartTrip('ACCEPTED')).toBe(true);
  });

  it('refuses to complete a trip that never started', () => {
    expect(canCompleteTrip('FORMING')).toBe(false);
    expect(canCompleteTrip('ACCEPTED')).toBe(false);
    expect(canCompleteTrip('ACTIVE')).toBe(true);
  });

  it('only FORMING pools can absorb more riders', () => {
    expect(isOpenForPooling('FORMING')).toBe(true);
    // Once Jashim has accepted, a late request must open a new pool rather
    // than mutate a trip he has already agreed to drive.
    expect(isOpenForPooling('ACCEPTED')).toBe(false);
    expect(isOpenForPooling('ACTIVE')).toBe(false);
  });

  it('rejects invalid and terminal transitions', () => {
    expect(() => assertPoolTransition('FORMING', 'ACTIVE')).toThrow(/Invalid pool state transition/);
    expect(() => assertPoolTransition('COMPLETED', 'ACTIVE')).toThrow();
    expect(() => assertPoolTransition('CANCELLED', 'ACCEPTED')).toThrow();
    expect(() => assertPoolTransition('FORMING', 'ACCEPTED')).not.toThrow();
  });
});
