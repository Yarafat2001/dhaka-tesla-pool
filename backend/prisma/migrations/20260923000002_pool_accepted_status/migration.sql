-- Adds the ACCEPTED pool status (Section 3: the driver "accepts" a pool before
-- the trip starts; until then the pool is still FORMING and open to more
-- riders).
--
-- Prisma-generated DDL, produced with:
--   npx prisma migrate diff --from-migrations prisma/migrations \
--     --to-schema-datamodel prisma/schema.prisma \
--     --shadow-database-url $SHADOW_DATABASE_URL --script
-- i.e. the existing migrations are replayed into a scratch shadow database and
-- diffed against schema.prisma, which is exactly how `prisma migrate dev`
-- derives migrations.
--
-- The value is appended to the enum, so no existing row is rewritten. Guarding
-- `Pool.status` transitions against the new value is application logic, not DDL
-- (see backend/src/domain/poolStateMachine.ts).

-- AlterEnum
ALTER TYPE "PoolStatus" ADD VALUE 'ACCEPTED';
