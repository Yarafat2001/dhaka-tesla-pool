/**
 * Matching rule (Section 4): two ride requests are POOL-COMPATIBLE if they
 * share the same pickup zone. Dropoff zones do not need to match - Nusrat
 * (Banani -> Mohakhali) and Rafiq (Banani -> Gulshan 1) are compatible
 * because they both board in Banani, even though they end up in different
 * places. This models real shared-CNG/Tesla behavior in Dhaka: a driver
 * picks up everyone waiting at the same spot and drops each passenger at
 * their own stop along a reasonable route.
 *
 * A request is only actually placed into a Pool if the Tesla also has
 * enough free seats (capacity check lives in rideService, since it needs
 * live DB state / a transaction - see docs/concurrency.md).
 */

export interface MatchCandidate {
  pickupZoneId: string;
  seats: number;
}

export function isPoolCompatible(
  a: Pick<MatchCandidate, 'pickupZoneId'>,
  b: Pick<MatchCandidate, 'pickupZoneId'>
): boolean {
  return a.pickupZoneId === b.pickupZoneId;
}

/**
 * Given an existing pool's already-committed pickup zone and seats used,
 * decide if a new candidate request can join.
 */
export function canJoinPool(params: {
  poolPickupZoneId: string;
  poolSeatsUsed: number;
  teslaCapacity: number;
  candidate: MatchCandidate;
}): { canJoin: boolean; reason?: string } {
  const { poolPickupZoneId, poolSeatsUsed, teslaCapacity, candidate } = params;

  if (candidate.pickupZoneId !== poolPickupZoneId) {
    return { canJoin: false, reason: 'different pickup zone' };
  }
  if (poolSeatsUsed + candidate.seats > teslaCapacity) {
    return { canJoin: false, reason: 'not enough free seats' };
  }
  return { canJoin: true };
}
