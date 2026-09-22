import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { calculateFare, isPooledPricing } from '../domain/fare';
import { canAffordWithWallet, PaymentMethod } from '../domain/payment';
import { assertTransition, isCancellable, RideStatus } from '../domain/stateMachine';

/**
 * Re-derives every non-cancelled rider's fare in a pool from *current* pool
 * membership, so all members are always priced on the same basis (see
 * isPooledPricing in domain/fare.ts). Called whenever membership changes: a
 * rider joins, a rider cancels, or the trip completes and fares are frozen.
 *
 * Estimates are allowed to move while a pool is forming (that is what an
 * estimate is); finalFarePoisha, frozen at completion, is the authoritative
 * value a passenger is charged.
 */
export async function repricePoolFares(tx: Prisma.TransactionClient, poolId: string) {
  const riders = await tx.rideRequest.findMany({
    where: { poolId, status: { not: 'CANCELLED' } },
  });
  const isPooled = isPooledPricing(riders.length);

  for (const ride of riders) {
    const distance = await tx.zoneDistance.findUnique({
      where: {
        fromZoneId_toZoneId: { fromZoneId: ride.pickupZoneId, toZoneId: ride.dropoffZoneId },
      },
    });
    if (!distance) continue;

    const { totalFarePoisha } = calculateFare({ distanceKm: distance.distanceKm, isPooled });
    if (totalFarePoisha !== ride.estimatedFarePoisha) {
      await tx.rideRequest.update({
        where: { id: ride.id },
        data: { estimatedFarePoisha: totalFarePoisha },
      });
    }
  }
}

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
  paymentMethod: PaymentMethod;
}) {
  const { passengerId, pickupZoneId, dropoffZoneId, seats, paymentMethod } = params;
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

  if (paymentMethod === 'TESLAPAY') {
    // Fail fast: a passenger shouldn't find out at the end of the trip that the
    // wallet can't cover it. Checked against the *solo* fare, which is the most
    // this trip can cost - pooling only ever discounts it further.
    const passenger = await prisma.user.findUnique({ where: { id: passengerId } });
    if (!passenger) throw new AppError('Passenger not found', 404);
    const soloFare = calculateFare({ distanceKm: distanceRow.distanceKm, isPooled: false });
    if (!canAffordWithWallet(passenger.walletBalancePoisha, soloFare.totalFarePoisha)) {
      throw new AppError(
        'Insufficient TeslaPay balance for this trip - top up your wallet or pay by cash',
        400
      );
    }
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
          paymentMethod,
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

      // The pool just gained a member: re-derive everyone's fare, so the
      // passenger who opened the pool gets the shared-ride discount too.
      await repricePoolFares(tx, pool.id);
      return tx.rideRequest.findUniqueOrThrow({ where: { id: rideRequest.id } });
    }

    // 2. No compatible pool with room - open a new one on an idle,
    // sufficiently large, online Tesla. Row is locked implicitly by the
    // surrounding transaction + the immediate seatsUsed update below.
    const tesla = await tx.tesla.findFirst({
      where: {
        isOnline: true,
        capacity: { gte: seats },
        pools: { none: { status: { in: ['FORMING', 'ACCEPTED', 'ACTIVE'] } } },
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
          paymentMethod,
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
        paymentMethod,
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

/**
 * Fare estimate without creating a ride - what the passenger UI shows while
 * choosing zones, so Section 3's "see estimated fare" happens *before*
 * committing to a request rather than after. Returns both the solo and the
 * pooled price so the UI can show what sharing would save.
 */
export async function estimateFare(pickupZoneId: string, dropoffZoneId: string) {
  if (pickupZoneId === dropoffZoneId) {
    throw new AppError('pickup and dropoff zones must differ', 400);
  }
  const distanceRow = await prisma.zoneDistance.findUnique({
    where: { fromZoneId_toZoneId: { fromZoneId: pickupZoneId, toZoneId: dropoffZoneId } },
  });
  if (!distanceRow) {
    throw new AppError('No known distance between these zones', 400);
  }

  return {
    distanceKm: distanceRow.distanceKm,
    solo: calculateFare({ distanceKm: distanceRow.distanceKm, isPooled: false }),
    pooled: calculateFare({ distanceKm: distanceRow.distanceKm, isPooled: true }),
  };
}

export async function getRideRequest(rideRequestId: string, requesterId: string) {
  const ride = await prisma.rideRequest.findUnique({
    where: { id: rideRequestId },
    include: {
      pickupZone: true,
      dropoffZone: true,
      payment: true,
      // The append-only audit trail, ordered oldest-first: this is what lets a
      // passenger answer "what actually happened on my ride?" (Section 2).
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  });
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
      // Losing a rider can flip the survivors back to solo pricing.
      await repricePoolFares(tx, ride.poolId);
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
