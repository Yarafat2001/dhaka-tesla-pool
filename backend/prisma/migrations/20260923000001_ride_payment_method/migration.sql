-- Adds the per-ride payment method chosen by the passenger (Section 5: cash or
-- the simulated TeslaPay wallet).
--
-- Unlike 20260101000000_init (hand-authored - see its header), this migration
-- is real Prisma-generated DDL: it was produced with
--   npx prisma migrate diff --from-url $DATABASE_URL \
--     --to-schema-datamodel prisma/schema.prisma --script
-- run in the api container against a database that already had the init
-- migration applied, so it is the authoritative diff for this schema change.
--
-- Existing rows default to CASH, which preserves pre-feature behaviour: before
-- this column existed, cash was the only settlement path.

-- AlterTable
ALTER TABLE "RideRequest" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
