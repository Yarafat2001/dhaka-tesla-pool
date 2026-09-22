/**
 * Concurrency problem (Section 14, exact scenario in the tests below):
 * Bullet has 1 seat left. Nusrat and Shirin both request it at nearly the
 * same instant; both read "1 seat free" before either write lands.
 *
 * NAIVE approach (read-then-write, not used in this codebase): read
 * seatsUsed, check in application code, then write seatsUsed+1. Two
 * concurrent requests can both pass the check before either writes,
 * overbooking the Tesla.
 *
 * ACTUAL approach used in rideService.ts: a single atomic, conditional SQL
 * UPDATE - "UPDATE pool SET seatsUsed = seatsUsed + :n WHERE id = :id AND
 * seatsUsed + :n <= capacity", executed inside a Prisma transaction. The
 * database (not application code) evaluates the WHERE clause against the
 * row's current value at write time, so only one of two racing requests can
 * match and succeed; the loser's UPDATE affects zero rows and the app
 * responds with "seat no longer available". This needs no external lock or
 * queue - Postgres's row-level locking during the UPDATE is sufficient at
 * this scale (see docs/concurrency.md for what changes at 1M-user scale).
 *
 * The two classes below simulate exactly this against an in-memory "table"
 * so the property can be unit tested without a running Postgres instance.
 */

export class NaivePoolStore {
  private seatsUsed = 0;
  constructor(private readonly capacity: number) {}

  getSeatsUsed(): number {
    return this.seatsUsed;
  }

  /** Read-then-write - vulnerable to a race between the read and the write. */
  async tryClaimSeat(simulatedDelayMs = 0): Promise<boolean> {
    const current = this.seatsUsed; // READ
    if (current >= this.capacity) return false;
    if (simulatedDelayMs > 0) {
      await new Promise((r) => setTimeout(r, simulatedDelayMs));
    }
    this.seatsUsed = current + 1; // WRITE, based on stale `current`
    return true;
  }
}

export class AtomicPoolStore {
  private seatsUsed = 0;
  constructor(private readonly capacity: number) {}

  getSeatsUsed(): number {
    return this.seatsUsed;
  }

  /**
   * Simulates `UPDATE ... SET seatsUsed = seatsUsed + 1 WHERE seatsUsed < capacity`
   * as a single synchronous critical section (JS's run-to-completion
   * semantics for non-async code stand in for the DB's row lock).
   */
  async tryClaimSeat(): Promise<boolean> {
    if (this.seatsUsed >= this.capacity) return false;
    this.seatsUsed += 1;
    return true;
  }
}
