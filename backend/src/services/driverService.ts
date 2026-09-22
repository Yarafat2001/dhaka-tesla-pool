import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { assertTransition, RideStatus } from '../domain/stateMachine';

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

  // Freeze final fares and create payment records once the trip is done.
  const rides = await prisma.rideRequest.findMany({ where: { poolId } });
  await prisma.$transaction(
    rides
      .filter((r) => r.status === 'COMPLETED')
      .map((r) =>
        prisma.rideRequest.update({
          where: { id: r.id },
          data: { finalFarePoisha: r.estimatedFarePoisha },
        })
      )
  );
  return updatedPool;
}
