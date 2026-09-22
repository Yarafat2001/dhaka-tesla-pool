import { canTransition, assertTransition, isCancellable } from '../domain/stateMachine';

describe('ride state machine', () => {
  it('allows the full happy-path lifecycle', () => {
    expect(canTransition('REQUESTED', 'MATCHED')).toBe(true);
    expect(canTransition('MATCHED', 'DRIVER_ARRIVED')).toBe(true);
    expect(canTransition('DRIVER_ARRIVED', 'STARTED')).toBe(true);
    expect(canTransition('STARTED', 'COMPLETED')).toBe(true);
  });

  it('allows cancellation from any pre-trip state', () => {
    expect(canTransition('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('MATCHED', 'CANCELLED')).toBe(true);
    expect(canTransition('DRIVER_ARRIVED', 'CANCELLED')).toBe(true);
  });

  it('rejects cancellation once a trip has started', () => {
    expect(canTransition('STARTED', 'CANCELLED')).toBe(false);
  });

  it('rejects skipping states (REQUESTED straight to STARTED)', () => {
    expect(canTransition('REQUESTED', 'STARTED')).toBe(false);
  });

  it('rejects any transition out of a terminal state', () => {
    expect(canTransition('COMPLETED', 'STARTED')).toBe(false);
    expect(canTransition('CANCELLED', 'MATCHED')).toBe(false);
  });

  it('rejects reversing a transition (STARTED back to MATCHED)', () => {
    expect(canTransition('STARTED', 'MATCHED')).toBe(false);
  });

  it('assertTransition throws on an invalid move', () => {
    expect(() => assertTransition('COMPLETED', 'CANCELLED')).toThrow(
      /Invalid ride state transition/
    );
  });

  it('assertTransition is silent on a valid move', () => {
    expect(() => assertTransition('REQUESTED', 'MATCHED')).not.toThrow();
  });

  it('isCancellable reflects the same rule as CANCELLED transitions', () => {
    expect(isCancellable('REQUESTED')).toBe(true);
    expect(isCancellable('STARTED')).toBe(false);
    expect(isCancellable('COMPLETED')).toBe(false);
  });
});
