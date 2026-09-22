-- Hand-authored to match backend/prisma/schema.prisma exactly.
--
-- NOTE ON HOW THIS FILE WAS PRODUCED: `prisma migrate dev` needs to download
-- a query-engine binary from binaries.prisma.sh at generate time. The
-- sandbox this was built in only allows a fixed list of package-registry
-- domains, so that download was blocked. This SQL was written by hand to
-- exactly mirror schema.prisma's models/columns/enums/constraints, and was
-- reviewed line-by-line against the schema rather than generated. In any
-- normal environment (including the Docker Compose setup in this repo,
-- which has full internet access) `prisma migrate dev` will generate this
-- file automatically the same way - this is a sandbox-only workaround, not
-- a design choice. See README > Known Limitations.

CREATE TYPE "Role" AS ENUM ('PASSENGER', 'DRIVER');
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PoolStatus" AS ENUM ('FORMING', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TESLAPAY');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "walletBalancePoisha" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");

CREATE TABLE "ZoneDistance" (
    "id" TEXT NOT NULL,
    "fromZoneId" TEXT NOT NULL,
    "toZoneId" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "ZoneDistance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZoneDistance_fromZoneId_toZoneId_key" ON "ZoneDistance"("fromZoneId", "toZoneId");
CREATE INDEX "ZoneDistance_fromZoneId_idx" ON "ZoneDistance"("fromZoneId");
CREATE INDEX "ZoneDistance_toZoneId_idx" ON "ZoneDistance"("toZoneId");

CREATE TABLE "Tesla" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tesla_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tesla_driverId_key" ON "Tesla"("driverId");
CREATE UNIQUE INDEX "Tesla_plate_key" ON "Tesla"("plate");

CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "teslaId" TEXT NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'FORMING',
    "seatsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Pool_teslaId_status_idx" ON "Pool"("teslaId", "status");

CREATE TABLE "RideRequest" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "pickupZoneId" TEXT NOT NULL,
    "dropoffZoneId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
    "poolId" TEXT,
    "estimatedFarePoisha" INTEGER NOT NULL,
    "finalFarePoisha" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RideRequest_passengerId_idx" ON "RideRequest"("passengerId");
CREATE INDEX "RideRequest_poolId_idx" ON "RideRequest"("poolId");
CREATE INDEX "RideRequest_status_idx" ON "RideRequest"("status");

CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "fromStatus" "RideStatus",
    "toStatus" "RideStatus" NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StatusHistory_rideRequestId_idx" ON "StatusHistory"("rideRequestId");

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "rideRequestId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountPoisha" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_rideRequestId_key" ON "Payment"("rideRequestId");

ALTER TABLE "ZoneDistance" ADD CONSTRAINT "ZoneDistance_fromZoneId_fkey" FOREIGN KEY ("fromZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZoneDistance" ADD CONSTRAINT "ZoneDistance_toZoneId_fkey" FOREIGN KEY ("toZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tesla" ADD CONSTRAINT "Tesla_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_teslaId_fkey" FOREIGN KEY ("teslaId") REFERENCES "Tesla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_dropoffZoneId_fkey" FOREIGN KEY ("dropoffZoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rideRequestId_fkey" FOREIGN KEY ("rideRequestId") REFERENCES "RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
