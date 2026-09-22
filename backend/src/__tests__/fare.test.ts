import { calculateFare, isPooledPricing, BASE_FARE_POISHA, PER_KM_POISHA } from '../domain/fare';

describe('calculateFare', () => {
  it('charges base + distance with no discount for a solo ride', () => {
    // Solo passenger, 4km, e.g. Jashim picks up a lone rider Banani -> Farmgate
    const result = calculateFare({ distanceKm: 4, isPooled: false });
    expect(result.baseFarePoisha).toBe(BASE_FARE_POISHA);
    expect(result.distanceChargePoisha).toBe(4 * PER_KM_POISHA);
    expect(result.poolDiscountPoisha).toBe(0);
    expect(result.totalFarePoisha).toBe(BASE_FARE_POISHA + 4 * PER_KM_POISHA);
  });

  it("calculates Nusrat's pooled fare correctly (Banani -> Mohakhali, 3.2km)", () => {
    // Worked example from docs/fare-model.md
    const result = calculateFare({ distanceKm: 3.2, isPooled: true });
    const expectedDistanceCharge = Math.round(3.2 * PER_KM_POISHA); // 4800
    const expectedDiscount = Math.round(expectedDistanceCharge * 0.2); // 960
    expect(result.distanceChargePoisha).toBe(expectedDistanceCharge);
    expect(result.poolDiscountPoisha).toBe(expectedDiscount);
    expect(result.totalFarePoisha).toBe(
      BASE_FARE_POISHA + expectedDistanceCharge - expectedDiscount
    );
    expect(result.totalFarePoisha).toBe(6840); // 3000 + 4800 - 960
  });

  it("calculates Rafiq's pooled fare correctly (Banani -> Gulshan 1, 2.5km)", () => {
    const result = calculateFare({ distanceKm: 2.5, isPooled: true });
    const expectedDistanceCharge = Math.round(2.5 * PER_KM_POISHA); // 3750
    const expectedDiscount = Math.round(expectedDistanceCharge * 0.2); // 750
    expect(result.totalFarePoisha).toBe(
      BASE_FARE_POISHA + expectedDistanceCharge - expectedDiscount
    );
    expect(result.totalFarePoisha).toBe(6000); // 3000 + 3750 - 750
  });

  it('gives Nusrat and Rafiq different fares despite sharing a Tesla', () => {
    const nusrat = calculateFare({ distanceKm: 3.2, isPooled: true });
    const rafiq = calculateFare({ distanceKm: 2.5, isPooled: true });
    expect(nusrat.totalFarePoisha).not.toBe(rafiq.totalFarePoisha);
  });

  it('rejects a negative distance', () => {
    expect(() => calculateFare({ distanceKm: -1, isPooled: false })).toThrow();
  });

  it('never produces fractional poisha (always an integer)', () => {
    const result = calculateFare({ distanceKm: 3.333, isPooled: true });
    expect(Number.isInteger(result.totalFarePoisha)).toBe(true);
    expect(Number.isInteger(result.distanceChargePoisha)).toBe(true);
    expect(Number.isInteger(result.poolDiscountPoisha)).toBe(true);
  });

  it('isPooledPricing requires a genuinely shared Tesla', () => {
    expect(isPooledPricing(0)).toBe(false);
    expect(isPooledPricing(1)).toBe(false); // opener riding alone so far
    expect(isPooledPricing(2)).toBe(true); // Nusrat + Rafiq
    expect(isPooledPricing(3)).toBe(true); // Bullet full: Nusrat + Rafiq + Shirin
  });

  it("re-prices Nusrat to the pooled fare once Rafiq shares her pool", () => {
    // Nusrat opens the pool alone, so the first estimate is the solo fare.
    const alone = calculateFare({ distanceKm: 3.2, isPooled: isPooledPricing(1) });
    expect(alone.poolDiscountPoisha).toBe(0);
    expect(alone.totalFarePoisha).toBe(7800); // 3000 + 4800

    // Rafiq joins the same pool. Nobody's distance changed, but the ride is
    // now genuinely shared, so Nusrat's fare is re-derived with the discount -
    // this is the 6840 figure asserted in docs/fare-model.md.
    const shared = calculateFare({ distanceKm: 3.2, isPooled: isPooledPricing(2) });
    expect(shared.totalFarePoisha).toBe(6840); // 3000 + 4800 - 960
  });

  it('falls back to solo pricing when the pool shrinks to one rider', () => {
    // Shirin cancels, leaving Nusrat + Rafiq: still pooled, still 6840/6000.
    expect(calculateFare({ distanceKm: 3.2, isPooled: isPooledPricing(2) }).totalFarePoisha).toBe(6840);
    // Rafiq then cancels too, leaving Nusrat alone: the discount no longer
    // applies, because there is no second rider to share the Tesla with.
    expect(calculateFare({ distanceKm: 3.2, isPooled: isPooledPricing(1) }).totalFarePoisha).toBe(7800);
  });
});
