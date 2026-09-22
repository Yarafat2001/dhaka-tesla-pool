# Concurrency: the Last-Seat Problem

## The scenario (Section 14)

Bullet has 1 seat left. Nusrat and Shirin both try to claim it at nearly the
same instant. Both read "1 seat free" before either write lands.

## Why the naive approach fails

A naive implementation reads `Pool.seatsUsed`, checks it against
`Tesla.capacity` in application code, and then writes `seatsUsed + 1`:

```
current = read(pool.seatsUsed)        // both requests read 2 (capacity 3)
if (current < capacity) {             // both pass the check
  write(pool.seatsUsed, current + 1)  // both compute 3, second write clobbers first
}
```

Both requests can pass the check before either write commits. Depending on
timing this either overbooks the Tesla (two passengers both told "you have
the seat" while capacity shows more riders than seats) or, as demonstrated
in this repo's test, causes a lost update - both writes compute the same
stale `current + 1`, so the counter ends up undercounting real occupancy
even though both requests were told they succeeded. Either failure mode is
unacceptable: the driver ends up with either too many riders or a seat
count that doesn't match who is actually in the car.

This is proven directly (not just asserted) in
`backend/src/__tests__/concurrency.test.ts` against `NaivePoolStore` in
`backend/src/domain/poolCapacityGuard.ts`.

## The fix: one atomic, conditional UPDATE

`rideService.ts` claims a seat with a single conditional update inside a
Prisma transaction, letting Postgres - not application code - evaluate the
capacity check at write time:

```ts
const claim = await tx.pool.updateMany({
  where: { id: pool.id, seatsUsed: { lte: pool.tesla.capacity - seats } },
  data: { seatsUsed: { increment: seats } },
});
if (claim.count === 0) {
  // lost the race (or pool filled between read and write) - try the next
  // candidate pool, or open a new one
}
```

Postgres evaluates the WHERE clause against the row's current value at the
moment of the write, under a row-level lock it holds for the duration of
the UPDATE. If Nusrat's and Shirin's requests race, Postgres serializes the
two UPDATEs: whichever commits first changes seatsUsed, and the second
UPDATE's WHERE clause then evaluates against the new value and naturally
fails to match (updateMany returns count: 0), rather than against a value
either request read before either wrote. No SELECT ... FOR UPDATE, external
lock, or distributed coordinator is needed - the conditional UPDATE is the
check-and-set, atomically, which is exactly what AtomicPoolStore in the
same test file demonstrates in isolation (20 concurrent claimants against a
3-seat Tesla, exactly 3 succeed, every time).

## What this does not solve, and what changes at scale

- Single Postgres instance, single row lock. This is correct but
  serializes writes to one Pool row - fine for the concurrency level a
  handful of Teslas produce, not for 100k drivers (see
  docs/scaling-bonus.md for read replicas / sharding / queue-based
  matching at that scale).
- No distributed transaction. Everything happens inside one Postgres
  transaction on one database. A multi-region deployment would need either
  a single source of truth for seat counts (e.g. all seat-claims routed to
  one primary) or a different consistency model (e.g. optimistic
  reservation + reconciliation), which is real added complexity this MVP
  deliberately does not take on per Section 9's "add complexity only when
  there is a reason."
- Retry policy on the losing request is currently "try the next candidate
  pool / open a new one" within the same HTTP request - fine at this
  scale, but a queue-based retry with backoff would be more robust under
  heavy contention (see bonus doc).

## Where this is actually asserted

- `backend/src/__tests__/concurrency.test.ts` - the naive-vs-atomic contrast in
  isolation (`NaivePoolStore` overbooks; `AtomicPoolStore` never does, including
  20 simultaneous claimants against 3 seats).
- `backend/src/__tests__/api.integration.test.ts` - the same property through the
  real stack: two simultaneous `POST /api/rides` for a 1-seat Tesla produce
  exactly one `MATCHED` and one `REQUESTED`, and `Pool.seatsUsed` ends at exactly
  `Tesla.capacity` (never 2). This is the version that would catch a regression
  in the Prisma `updateMany` clause itself, which the in-memory test cannot.
