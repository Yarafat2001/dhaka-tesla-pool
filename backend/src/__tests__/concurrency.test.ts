import { NaivePoolStore, AtomicPoolStore } from '../domain/poolCapacityGuard';

describe('Bullet capacity under concurrent claims (Nusrat vs Shirin, 1 seat left)', () => {
  it('naive read-then-write CAN overbook the last seat (demonstrates the bug)', async () => {
    const store = new NaivePoolStore(3);
    store; // capacity 3, simulate 2 already seated by claiming twice first
    await store.tryClaimSeat();
    await store.tryClaimSeat();
    // Now 1 seat left. Nusrat and Shirin both race for it, each with a
    // simulated delay between their read and their write so the race
    // window is guaranteed to overlap.
    const [nusrat, shirin] = await Promise.all([
      store.tryClaimSeat(10),
      store.tryClaimSeat(10),
    ]);

    // Demonstrates the bug: BOTH requests are told they got the seat...
    expect(nusrat).toBe(true);
    expect(shirin).toBe(true);
    // ...but because both read the same stale seatsUsed before either wrote,
    // the second write clobbers the first (a lost update): the counter ends
    // at 3, not 4, even though the app just told two different passengers
    // they each hold Bullet's last seat. Either way the system is wrong -
    // either it double-assigns the seat, or (as here) it silently loses
    // track of who actually has it. This is exactly why seat claiming must
    // be one atomic conditional UPDATE, not a read-then-write.
    expect(store.getSeatsUsed()).toBe(3);
  });

  it('atomic conditional update NEVER overbooks - exactly one of two racers wins', async () => {
    const store = new AtomicPoolStore(3);
    await store.tryClaimSeat();
    await store.tryClaimSeat();

    const [nusrat, shirin] = await Promise.all([
      store.tryClaimSeat(),
      store.tryClaimSeat(),
    ]);

    const winners = [nusrat, shirin].filter(Boolean).length;
    expect(winners).toBe(1);
    expect(store.getSeatsUsed()).toBe(3); // capacity respected exactly
  });

  it('atomic store rejects a claim once genuinely full', async () => {
    const store = new AtomicPoolStore(1);
    const first = await store.tryClaimSeat();
    const second = await store.tryClaimSeat();
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(store.getSeatsUsed()).toBe(1);
  });

  it('atomic store holds under many concurrent claimants (stress check)', async () => {
    const capacity = 3;
    const store = new AtomicPoolStore(capacity);
    const claimants = Array.from({ length: 20 }, () => store.tryClaimSeat());
    const results = await Promise.all(claimants);
    const successes = results.filter(Boolean).length;
    expect(successes).toBe(capacity);
    expect(store.getSeatsUsed()).toBe(capacity);
  });
});
