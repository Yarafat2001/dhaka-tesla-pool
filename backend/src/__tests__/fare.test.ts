import { calculateFare, BASE_FARE_POISHA, PER_KM_POISHA } from '../domain/fare';

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
});
