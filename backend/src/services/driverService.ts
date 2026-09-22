import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { assertTransition, RideStatus } from '../domain/stateMachine';
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
        where: { status: { in: ['FORMING', 'ACTIVE'] } },
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
  return prisma.$transaction(async (tx) => {
    const pool = await tx.pool.findUnique({
      where: { id: poolId },
      include: { tesla: true, rideRequests: true },
    });
    if (!pool) throw new AppError('Pool not found', 404);
    if (pool.tesla.driverId !== driverId) {
      throw new AppError('Not authorized to operate this pool', 403);
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

    const poolStatus = toStatus === 'STARTED' ? 'ACTIVE' : pool.status;
    const finalPoolStatus =
      toStatus === 'COMPLETED' ? 'COMPLETED' : poolStatus;

    return tx.pool.update({ where: { id: poolId }, data: { status: finalPoolStatus } });
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
  await prisma.$transaction(async (tx) => {
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
