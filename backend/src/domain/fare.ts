/**
 * Fare model (see docs/fare-model.md for the full writeup and worked example).
 *
 * passengerFare = baseFare + distanceCharge - poolDiscount
 *
 * All money is stored and computed as INTEGER POISHA (BDT * 100), never as
 * floats/decimals. Floating point arithmetic on money accumulates rounding
 * error (0.1 + 0.2 !== 0.3) which is unacceptable when fares are split
 * between passengers and reconciled later. Integers make every intermediate
 * value exact, and BDT has no sub-poisha denomination so no precision is lost.
 */

export const BASE_FARE_POISHA = 3000; // BDT 30.00 flat boarding charge
export const PER_KM_POISHA = 1500; // BDT 15.00 per km
export const POOL_DISCOUNT_PERCENT = 20; // 20% off the distance charge per
// pooled passenger when 2+ unrelated requests share a Tesla

export interface FareInput {
  distanceKm: number;
  isPooled: boolean; // true if this request shares its Pool with >=1 other request
}

export interface FareBreakdown {
  baseFarePoisha: number;
  distanceChargePoisha: number;
  poolDiscountPoisha: number;
  totalFarePoisha: number;
}

/**
 * Computes one passenger's fare. Each passenger in a pool pays for their own
 * distance - there is no "split the total fare N ways" step, because
 * Nusrat and Rafiq travel overlapping-but-different distances (Banani -> 
 * Mohakhali vs Banani -> Gulshan 1) and should not subsidize each other's
 * longer/shorter leg. The pool discount is what rewards sharing, applied
 * per-passenger against their own distance charge.
 */
export function calculateFare(input: FareInput): FareBreakdown {
  if (input.distanceKm < 0) {
    throw new Error('distanceKm must be >= 0');
  }

  const baseFarePoisha = BASE_FARE_POISHA;
  const distanceChargePoisha = Math.round(input.distanceKm * PER_KM_POISHA);
  const poolDiscountPoisha = input.isPooled
    ? Math.round((distanceChargePoisha * POOL_DISCOUNT_PERCENT) / 100)
    : 0;

  const totalFarePoisha =
    baseFarePoisha + distanceChargePoisha - poolDiscountPoisha;

  return {
    baseFarePoisha,
    distanceChargePoisha,
    poolDiscountPoisha,
    totalFarePoisha,
  };
}

export function poishaToDisplay(poisha: number): string {
  const taka = poisha / 100;
  return `৳${taka.toFixed(2)}`;
}
