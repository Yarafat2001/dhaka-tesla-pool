import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { assertTransition, RideStatus } from '../domain/stateMachine';
import {
  assertPoolTransition,
  canAcceptPool,
  canCompleteTrip,
  canMarkArrived,
  canStartTrip,
  PoolStatus,
} from '../domain/poolStateMachine';
import { settlePayment } from '../domain/payment';
import { repricePoolFares } from './rideService';

export async function setOnlineStatus(driverId: string, isOnline: boolean) {
  const tesla = await prisma.tesla.findUnique({ where: { driverId } });
  if (!tesla) throw new AppError('This user has no registered Tesla', 400);
  return prisma.tesla.update({ where: { driverId }, data: { isOnline } });
}

export async function getMyTeslaWithActivePool(driverId: string) {
  const tesla = await prisma.tesla.findUnique({
    where: { driverId },
    include: {
      pools: {
        // Everything the driver still has to act on: a forming pool (riders
        // waiting), a pool they have accepted but not started, and one in
        // progress. Completed/cancelled pools are history - see
        // getDriverHistory.
        where: { status: { in: ['FORMING', 'ACCEPTED', 'ACTIVE'] } },
        include: { rideRequests: { include: { passenger: true, pickupZone: true, dropoffZone: true } } },
      },
    },
  });
  if (!tesla) throw new AppError('This user has no registered Tesla', 400);
  return tesla;
}

async function transitionPoolRides(
  poolId: string,
  driverId: string,
  toStatus: Exclude<RideStatus, 'REQUESTED' | 'CANCELLED'>
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const pool = await tx.pool.findUnique({
      where: { id: poolId },
      include: { tesla: true, rideRequests: true },
    });
    if (!pool) throw new AppError('Pool not found', 404);
    if (pool.tesla.driverId !== driverId) {
      throw new AppError('Not authorized to operate this pool', 403);
    }

    // Pool-level guards: each driver action is only legal from a specific pool
    // status, so a stale UI (or two taps on "Start trip") can't skip a step.
    const currentPoolStatus = pool.status as PoolStatus;
    if (toStatus === 'DRIVER_ARRIVED' && !canMarkArrived(currentPoolStatus)) {
      throw new AppError(
        `Cannot mark arrival: pool is ${currentPoolStatus} - accept the pool first`,
        409
      );
    }
    if (toStatus === 'STARTED' && !canStartTrip(currentPoolStatus)) {
      throw new AppError(
        `Cannot start the trip: pool is ${currentPoolStatus} - accept the pool first`,
        409
      );
    }
    if (toStatus === 'COMPLETED' && !canCompleteTrip(currentPoolStatus)) {
      throw new AppError(
        `Cannot complete the trip: pool is ${currentPoolStatus} - start it first`,
        409
      );
    }

    for (const ride of pool.rideRequests) {
      if (ride.status === 'CANCELLED') continue; // skip riders who already cancelled
      assertTransition(ride.status as RideStatus, toStatus);
      await tx.rideRequest.update({ where: { id: ride.id }, data: { status: toStatus } });
      await tx.statusHistory.create({
        data: {
          rideRequestId: ride.id,
          fromStatus: ride.status,
          toStatus,
          changedById: driverId,
        },
      });
    }

    const finalPoolStatus: PoolStatus =
      toStatus === 'COMPLETED' ? 'COMPLETED' : toStatus === 'STARTED' ? 'ACTIVE' : currentPoolStatus;

    return tx.pool.update({ where: { id: poolId }, data: { status: finalPoolStatus } });
  });
}

/**
 * The driver commits to a pool (Section 3: "accept a ride/pool").
 *
 * Until this happens the pool is FORMING and can still absorb more riders;
 * accepting locks it, so the trip the driver agreed to drive is the trip that
 * actually happens. Pool-level transitions are reflected in
 * Pool.status/Pool.updatedAt; the per-passenger audit trail lives in
 * StatusHistory and is unchanged by acceptance (each rider stays MATCHED).
 */
export async function acceptPool(poolId: string, driverId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const pool = await tx.pool.findUnique({ where: { id: poolId }, include: { tesla: true } });
    if (!pool) throw new AppError('Pool not found', 404);
    if (pool.tesla.driverId !== driverId) {
      throw new AppError('Not authorized to operate this pool', 403);
    }
    if (!canAcceptPool(pool.status as PoolStatus)) {
      throw new AppError(`Cannot accept a pool in status ${pool.status}`, 409);
    }
    assertPoolTransition(pool.status as PoolStatus, 'ACCEPTED');

    return tx.pool.update({ where: { id: poolId }, data: { status: 'ACCEPTED' } });
  });
}

export const markDriverArrived = (poolId: string, driverId: string) =>
  transitionPoolRides(poolId, driverId, 'DRIVER_ARRIVED');
export const startTrip = (poolId: string, driverId: string) =>
  transitionPoolRides(poolId, driverId, 'STARTED');

export async function completeTrip(poolId: string, driverId: string) {
  const updatedPool = await transitionPoolRides(poolId, driverId, 'COMPLETED');

  // The pool's membership is final now (nobody can join a completed trip), so
  // re-derive every rider's fare one last time - this is what gives the
  // passenger who opened the pool the shared-ride discount - then freeze it as
  // the authoritative amount that will be charged.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await repricePoolFares(tx, poolId);

    const rides = await tx.rideRequest.findMany({
      where: { poolId, status: 'COMPLETED' },
      include: { passenger: true },
    });

    for (const ride of rides) {
      const fare = ride.estimatedFarePoisha;

      // 1. Freeze the amount this passenger is charged.
      await tx.rideRequest.update({
        where: { id: ride.id },
        data: { finalFarePoisha: fare },
      });

      // 2. Settle it - cash is handed over in the Tesla; TeslaPay debits the
      //    simulated wallet. Upsert (not create) so a retried completion can
      //    never leave two payment rows for one ride.
      const settlement = settlePayment({
        method: ride.paymentMethod,
        amountPoisha: fare,
        walletBalancePoisha: ride.passenger.walletBalancePoisha,
      });

      await tx.payment.upsert({
        where: { rideRequestId: ride.id },
        create: {
          rideRequestId: ride.id,
          method: ride.paymentMethod,
          amountPoisha: fare,
          status: settlement.status,
        },
        update: { amountPoisha: fare, status: settlement.status },
      });

      if (ride.paymentMethod === 'TESLAPAY' && settlement.status === 'PAID') {
        await tx.user.update({
          where: { id: ride.passengerId },
          data: { walletBalancePoisha: settlement.newWalletBalancePoisha },
        });
      }
    }
  });

  return updatedPool;
}

/**
 * Finished trips, for the driver's own history (Section 3: the driver should be
 * able to see "passengers/seats and ride history"). Only this driver's Tesla is
 * ever included - the query is scoped by teslaId, not by a pool id supplied by
 * the caller, so there is nothing to authorize beyond "you own this Tesla".
 */
export async function getDriverHistory(driverId: string) {
  const tesla = await prisma.tesla.findUnique({ where: { driverId } });
  if (!tesla) throw new AppError('This user has no registered Tesla', 400);

  const pools = await prisma.pool.findMany({
    where: { teslaId: tesla.id, status: { in: ['COMPLETED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      rideRequests: {
        include: { passenger: true, pickupZone: true, dropoffZone: true, payment: true },
      },
    },
  });

  return {
    tesla: { id: tesla.id, name: tesla.name, capacity: tesla.capacity },
    pools: pools.map((pool: (typeof pools)[number]) => ({
      id: pool.id,
      status: pool.status,
      seatsUsed: pool.seatsUsed,
      startedAt: pool.createdAt,
      finishedAt: pool.updatedAt,
      totalEarnedPoisha: pool.rideRequests
        .filter((ride: (typeof pool.rideRequests)[number]) => ride.status === 'COMPLETED')
        .reduce((sum: number, ride: (typeof pool.rideRequests)[number]) => sum + (ride.finalFarePoisha ?? 0), 0),
      passengers: pool.rideRequests.map((ride: (typeof pool.rideRequests)[number]) => ({
        name: ride.passenger.name,
        seats: ride.seats,
        status: ride.status,
        from: ride.pickupZone.name,
        to: ride.dropoffZone.name,
        farePoisha: ride.finalFarePoisha ?? ride.estimatedFarePoisha,
        paymentMethod: ride.paymentMethod,
        paymentStatus: ride.payment?.status ?? 'PENDING',
      })),
    })),
  };
}
