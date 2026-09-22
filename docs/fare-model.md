# Fare Model

## Formula

```
passengerFare = baseFare + distanceCharge - poolDiscount

baseFare       = 3000 poisha (BDT 30.00), flat
distanceCharge = round(distanceKm * 1500 poisha/km)
poolDiscount   = isPooled ? round(distanceCharge * 20%) : 0
```

Constants live in `backend/src/domain/fare.ts` as
`BASE_FARE_POISHA`, `PER_KM_POISHA`, `POOL_DISCOUNT_PERCENT`.

Each passenger is charged for **their own distance**, not an even split of
a combined trip total. This matters because Nusrat and Rafiq travel
different distances despite sharing a Tesla - an even split would either
overcharge the shorter trip or undercharge the longer one. The pool
discount (not a split) is what rewards them for sharing.

## Worked example - Nusrat and Rafiq (hand-verifiable)

| | Nusrat (Banani &rarr; Mohakhali) | Rafiq (Banani &rarr; Gulshan 1) |
|---|---|---|
| distanceKm | 3.2 | 2.5 |
| baseFare | 3000 | 3000 |
| distanceCharge | round(3.2 &times; 1500) = 4800 | round(2.5 &times; 1500) = 3750 |
| poolDiscount (20%) | round(4800 &times; 0.2) = 960 | round(3750 &times; 0.2) = 750 |
| **totalFare** | **3000 + 4800 - 960 = 6840 poisha = &#2547;68.40** | **3000 + 3750 - 750 = 6000 poisha = &#2547;60.00** |

This exact calculation is asserted in
`backend/src/__tests__/fare.test.ts`. Distances come from the seeded
`ZoneDistance` matrix (`backend/prisma/seed.ts`), not a routing API
(Section 4).

## Estimates move while a pool is forming

`estimatedFarePoisha` is re-derived from *current* pool membership, not frozen
at request time. `repricePoolFares` (`rideService.ts`) runs whenever that
membership changes: a rider joins, a rider cancels, or the trip completes and
fares are frozen.

That matters for the passenger who *opens* a pool, because at that instant they
are riding alone:

| Nusrat's state | riders in pool | isPooled | estimatedFarePoisha |
|---|---|---|---|
| opens the pool alone | 1 | false | 3000 + 4800 = **7800** |
| Rafiq joins | 2 | true | 3000 + 4800 - 960 = **6840** |
| Rafiq and Shirin both cancel | 1 | false | back to **7800** |

Without this, the opener would keep paying the solo fare while the joiner got
20% off for the same shared ride - the exact asymmetry called out in the
README's "one rejected suggestion" note. The amount frozen as
`finalFarePoisha` at `COMPLETED` is the authoritative one; the estimate is
exactly that, an estimate, and it is allowed to improve as the pool fills.

## Why integer poisha, not decimal/float

- BDT has no denomination smaller than poisha (1 taka = 100 poisha), so
  storing money as an integer count of poisha loses zero precision.
- Floating point (`0.1 + 0.2 !== 0.3` in IEEE 754) is unsafe for money that
  gets added, discounted, and compared across many operations - errors
  compound and can silently under/overcharge by fractions of a poisha that
  accumulate at scale.
- `Decimal`/`Numeric` database types avoid the float problem but add
  serialization overhead and library-specific decimal-object handling on
  every read; plain integers work with ordinary arithmetic in every
  language/ORM without an extra type dependency.
- Display-only conversion (`poishaToDisplay` in `fare.ts`) divides by 100
  purely for rendering (`৳68.40`) - the stored and computed value is always
  the integer.

## Payment

`Payment.method` is `CASH` or `TESLAPAY` (a simulated wallet -
`User.walletBalancePoisha`, debited in `driverService.completeTrip` when
method is `TESLAPAY`). No real payment gateway is integrated, per Section 5.

## What would change this model

- **Traffic/surge multiplier**: would be a multiplier applied to
  `distanceCharge` before the pool discount, sourced from a `SurgeRule`
  table keyed by zone/time-of-day rather than hardcoded, so it can be
  adjusted without a deploy.
- **Per-seat vs per-passenger pricing**: currently `seats` on a
  `RideRequest` scales capacity consumption but not fare (a party of 2
  booked by one passenger pays one `estimatedFarePoisha`, not double) -
  documented as a deliberate simplification; the fix, if needed, would be
  multiplying `distanceCharge` by `seats` before the discount.
