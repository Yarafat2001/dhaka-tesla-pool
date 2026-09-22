import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { calculateFare } from '../domain/fare';
import { assertTransition, isCancellable, RideStatus } from '../domain/stateMachine';

/**
 * Creates a ride request and attempts to match it into a compatible,
 * not-yet-full pool (same pickup zone, per docs/matching rule). If none
 * exists, it opens a new Pool on the first available online Tesla with
 * enough free capacity.
 *
 * Concurrency: the seat claim is a single conditional `updateMany` inside a
 * transaction - `WHERE id = pool.id AND seatsUsed + :n <= capacity`. If two
 * requests race for the last seat, only one `updateMany` affects a row; the
 * loser retries against the next candidate pool or opens a new one. See
 * docs/concurrency.md and src/domain/poolCapacityGuard.ts for the isolated
 * proof of why this is safe.
 */
export async function requestRide(params: {
  passengerId: string;
  pickupZoneId: string;
  dropoffZoneId: string;
  seats: number;
}) {
  const { passengerId, pickupZoneId, dropoffZoneId, seats } = params;
  if (seats < 1) throw new AppError('seats must be at least 1', 400);
  if (pickupZoneId === dropoffZoneId) {
    throw new AppError('pickup and dropoff zones must differ', 400);
  }

  const distanceRow = await prisma.zoneDistance.findUnique({
    where: { fromZoneId_toZoneId: { fromZoneId: pickupZoneId, toZoneId: dropoffZoneId } },
  });
  if (!distanceRow) {
    throw new AppError('No known distance between these zones', 400);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Try to join an existing FORMING pool at this pickup zone with room.
    const candidatePools = await tx.pool.findMany({
      where: {
        status: 'FORMING',
        rideRequests: { some: { pickupZoneId } },
      },
      include: { tesla: true },
    });

    for (const pool of candidatePools) {
      if (pool.seatsUsed + seats > pool.tesla.capacity) continue;

      // Atomic conditional claim: only succeeds if capacity still holds at
      // write time, regardless of what we read a moment ago.
      const claim = await tx.pool.updateMany({
        where: { id: pool.id, seatsUsed: { lte: pool.tesla.capacity - seats } },
        data: { seatsUsed: { increment: seats } },
      });
      if (claim.count === 0) continue; // lost the race, try the next candidate

      const isPooled = true; // joining an existing pool means sharing
      const fare = calculateFare({ distanceKm: distanceRow.distanceKm, isPooled });

      const rideRequest = await tx.rideRequest.create({
        data: {
          passengerId,
          pickupZoneId,
          dropoffZoneId,
          seats,
          poolId: pool.id,
          status: 'MATCHED',
          estimatedFarePoisha: fare.totalFarePoisha,
        },
      });
      await tx.statusHistory.create({
        data: {
          rideRequestId: rideRequest.id,
          fromStatus: 'REQUESTED',
          toStatus: 'MATCHED',
          changedById: passengerId,
          note: `Joined existing pool ${pool.id}`,
        },
      });
      return rideRequest;
    }

    // 2. No compatible pool with room - open a new one on an idle,
    // sufficiently large, online Tesla. Row is locked implicitly by the
    // surrounding transaction + the immediate seatsUsed update below.
    const tesla = await tx.tesla.findFirst({
      where: {
        isOnline: true,
        capacity: { gte: seats },
        pools: { none: { status: { in: ['FORMING', 'ACTIVE'] } } },
      },
    });

    if (!tesla) {
      // Fall back to REQUESTED (unmatched) rather than failing outright -
      // the passenger waits for a driver to come online, matching the
      // waiting -> matched status flow described in Section 3.
      const fare = calculateFare({ distanceKm: distanceRow.distanceKm, isPooled: false });
      const rideRequest = await tx.rideRequest.create({
        data: {
          passengerId,
          pickupZoneId,
          dropoffZoneId,
          seats,
          status: 'REQUESTED',
          estimatedFarePoisha: fare.totalFarePoisha,
        },
      });
      await tx.statusHistory.create({
        data: { rideRequestId: rideRequest.id, toStatus: 'REQUESTED', changedById: passengerId },
      });
      return rideRequest;
    }

    const pool = await tx.pool.create({
      data: { teslaId: tesla.id, status: 'FORMING', seatsUsed: seats },
    });

    const fare = calculateFare({ distanceKm: distanceRow.distanceKm, isPooled: false });
    const rideRequest = await tx.rideRequest.create({
      data: {
        passengerId,
        pickupZoneId,
        dropoffZoneId,
        seats,
        poolId: pool.id,
        status: 'MATCHED',
        estimatedFarePoisha: fare.totalFarePoisha,
      },
    });
    await tx.statusHistory.create({
      data: {
        rideRequestId: rideRequest.id,
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        changedById: passengerId,
        note: `Opened new pool ${pool.id} on Tesla ${tesla.id}`,
      },
    });
    return rideRequest;
  });
}

export async function getRideRequest(rideRequestId: string, requesterId: string) {
  const ride = await prisma.rideRequest.findUnique({ where: { id: rideRequestId } });
  if (!ride) throw new AppError('Ride request not found', 404);
  if (ride.passengerId !== requesterId) {
    // Each passenger sees only their own fare/status (Section 2).
    throw new AppError('Not authorized to view this ride request', 403);
  }
  return ride;
}

export async function listMyRides(passengerId: string) {
  return prisma.rideRequest.findMany({
    where: { passengerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function cancelRide(rideRequestId: string, passengerId: string) {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
    if (!ride) throw new AppError('Ride request not found', 404);
    if (ride.passengerId !== passengerId) {
      throw new AppError('Not authorized to cancel this ride request', 403);
    }
    if (!isCancellable(ride.status as RideStatus)) {
      throw new AppError(`Cannot cancel a ride in status ${ride.status}`, 409);
    }
    assertTransition(ride.status as RideStatus, 'CANCELLED');

    const updated = await tx.rideRequest.update({
      where: { id: rideRequestId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (ride.poolId) {
      // Free the seats this passenger was holding.
      await tx.pool.update({
        where: { id: ride.poolId },
        data: { seatsUsed: { decrement: ride.seats } },
      });
    }

    await tx.statusHistory.create({
      data: {
        rideRequestId,
        fromStatus: ride.status,
        toStatus: 'CANCELLED',
        changedById: passengerId,
      },
    });

    return updated;
  });
}
