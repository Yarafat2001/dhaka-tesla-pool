import { isPoolCompatible, canJoinPool } from '../domain/matching';

const BANANI = 'zone-banani';
const GULSHAN = 'zone-gulshan-1';

describe('isPoolCompatible', () => {
  it('treats same-pickup-zone requests as compatible (Nusrat + Rafiq)', () => {
    // Nusrat: Banani -> Mohakhali, Rafiq: Banani -> Gulshan 1
    // Different destinations, same pickup zone -> compatible.
    expect(
      isPoolCompatible({ pickupZoneId: BANANI }, { pickupZoneId: BANANI })
    ).toBe(true);
  });

  it('treats different-pickup-zone requests as incompatible', () => {
    expect(
      isPoolCompatible({ pickupZoneId: BANANI }, { pickupZoneId: GULSHAN })
    ).toBe(false);
  });
});

describe('canJoinPool', () => {
  it('allows Rafiq to join a pool Nusrat started, within capacity', () => {
    const result = canJoinPool({
      poolPickupZoneId: BANANI,
      poolSeatsUsed: 1, // Nusrat already seated
      teslaCapacity: 3, // Bullet
      candidate: { pickupZoneId: BANANI, seats: 1 }, // Rafiq
    });
    expect(result.canJoin).toBe(true);
  });

  it("rejects Shirin when Bullet's remaining seat is already gone", () => {
    const result = canJoinPool({
      poolPickupZoneId: BANANI,
      poolSeatsUsed: 3, // Bullet already full (Nusrat + Rafiq took the last seat)
      teslaCapacity: 3,
      candidate: { pickupZoneId: BANANI, seats: 1 }, // Shirin
    });
    expect(result.canJoin).toBe(false);
    expect(result.reason).toMatch(/seats/);
  });

  it('rejects a request from a different pickup zone even with free seats', () => {
    const result = canJoinPool({
      poolPickupZoneId: BANANI,
      poolSeatsUsed: 1,
      teslaCapacity: 3,
      candidate: { pickupZoneId: GULSHAN, seats: 1 },
    });
    expect(result.canJoin).toBe(false);
    expect(result.reason).toMatch(/zone/);
  });

  it('rejects a multi-seat request that would exceed remaining capacity', () => {
    const result = canJoinPool({
      poolPickupZoneId: BANANI,
      poolSeatsUsed: 2,
      teslaCapacity: 3,
      candidate: { pickupZoneId: BANANI, seats: 2 }, // only 1 seat left
    });
    expect(result.canJoin).toBe(false);
  });
});
