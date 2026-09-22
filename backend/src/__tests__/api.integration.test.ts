import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';

/**
 * API-level integration tests: Express routes -> services -> Prisma -> Postgres,
 * covering the scenarios Section 12 asks to be tested, including the two that
 * cannot be proven with pure unit tests - "users can't modify another user's
 * ride" and "two concurrent requests can't corrupt pool capacity".
 *
 * Safety: this suite creates and deletes its own zones/users, so it refuses to
 * run unless DATABASE_URL points at an isolated schema (see README):
 *   DATABASE_URL="postgresql://...?schema=test" npx prisma migrate deploy
 *   npm run test:integration
 */

const app = createApp();

const ZONES = [
  { name: 'Banani', lat: 23.7937, lng: 90.4066 },
  { name: 'Mohakhali', lat: 23.7789, lng: 90.4056 },
  { name: 'Gulshan 1', lat: 23.7808, lng: 90.4142 },
  { name: 'Dhanmondi', lat: 23.7461, lng: 90.3742 },
  { name: 'Farmgate', lat: 23.7574, lng: 90.3898 },
];

// Same distances as prisma/seed.ts, so the fares asserted below are the same
// hand-verifiable figures as docs/fare-model.md.
const DISTANCES: Array<[string, string, number]> = [
  ['Banani', 'Mohakhali', 3.2],
  ['Banani', 'Gulshan 1', 2.5],
  ['Banani', 'Dhanmondi', 8.1],
  ['Banani', 'Farmgate', 6.0],
];

const TEST_PREFIX = '0198'; // distinct from the seeded demo numbers (0171...)
const phone = (n: number) => `${TEST_PREFIX}000000${n}`;

const zone: Record<string, string> = {};
const auth: Record<string, string> = {};
let poolId = '';
const as = (who: string) => ({ Authorization: `Bearer ${auth[who]}` });

async function signup(name: string, role: 'PASSENGER' | 'DRIVER', n: number, tesla?: object) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name, phone: phone(n), password: 'password123', role, ...(tesla ?? {}) });
  expect(res.status).toBe(201);
  auth[name] = res.body.token;
  return res.body.user.id as string;
}

const requestRide = (who: string, from: string, to: string, extra: object = {}) =>
  request(app)
    .post('/api/rides')
    .set(as(who))
    .send({ pickupZoneId: zone[from], dropoffZoneId: zone[to], seats: 1, ...extra });

beforeAll(async () => {
  if (!/[?&]schema=test/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error(
      'Refusing to run: point DATABASE_URL at an isolated schema (e.g. ?schema=test) so demo/seed data is never touched'
    );
  }

  // Belt and braces: verify the *actual connection* landed in the test schema.
  // A string check on DATABASE_URL would not catch a .env file quietly winning
  // over the environment, and this suite deletes rows in afterAll.
  const [{ current_schema: connectedSchema }] = await prisma.$queryRaw<
    Array<{ current_schema: string }>
  >`SELECT current_schema() AS current_schema`;
  if (connectedSchema !== 'test') {
    throw new Error(
      `Refusing to run: connected to schema "${connectedSchema}", expected "test" - demo data would be at risk`
    );
  }

  for (const z of ZONES) {
    const created = await prisma.zone.upsert({ where: { name: z.name }, update: z, create: z });
    zone[z.name] = created.id;
  }
  for (const [a, b, km] of DISTANCES) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      await prisma.zoneDistance.upsert({
        where: { fromZoneId_toZoneId: { fromZoneId: zone[from], toZoneId: zone[to] } },
        update: { distanceKm: km },
        create: { fromZoneId: zone[from], toZoneId: zone[to], distanceKm: km },
      });
    }
  }

  // The cast, created through the public API so signup/login are exercised too.
  await signup('Jashim', 'DRIVER', 1, {
    teslaName: 'Bullet',
    teslaPlate: 'TEST-BULLET-01',
    teslaCapacity: 3,
  });
  await signup('Nusrat', 'PASSENGER', 2);
  await signup('Rafiq', 'PASSENGER', 3);
  await signup('Shirin', 'PASSENGER', 4);
  await signup('Karim', 'PASSENGER', 5);
  await signup('Shanto', 'PASSENGER', 6);

  // Nusrat rides on TeslaPay, so her wallet needs BDT 500.00 in it.
  const topUp = await request(app)
    .post('/api/wallet/topup')
    .set(as('Nusrat'))
    .send({ amountPoisha: 50000 });
  expect(topUp.status).toBe(200);
  expect(topUp.body.walletBalancePoisha).toBe(50000);

  await request(app).post('/api/driver/online').set(as('Jashim')).send({ isOnline: true });
});

afterAll(async () => {
  // Delete only what this suite created, in FK-safe order.
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const rides = await prisma.rideRequest.findMany({
    where: { passengerId: { in: userIds } },
    select: { id: true, poolId: true },
  });
  const rideIds = rides.map((r) => r.id);
  const poolIds = [...new Set(rides.map((r) => r.poolId).filter((p): p is string => p !== null))];

  await prisma.payment.deleteMany({ where: { rideRequestId: { in: rideIds } } });
  await prisma.statusHistory.deleteMany({ where: { rideRequestId: { in: rideIds } } });
  await prisma.rideRequest.deleteMany({ where: { id: { in: rideIds } } });
  await prisma.pool.deleteMany({ where: { id: { in: poolIds } } });
  await prisma.tesla.deleteMany({ where: { driverId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.zoneDistance.deleteMany({ where: { fromZoneId: { in: Object.values(zone) } } });
  await prisma.zone.deleteMany({ where: { id: { in: Object.values(zone) } } });

  await prisma.$disconnect();
});

describe('auth and access control', () => {
  it('serves health and the public zone list', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const zones = await request(app).get('/api/zones');
    expect(zones.status).toBe(200);
    expect(zones.body.map((z: { name: string }) => z.name)).toContain('Banani');
  });

  it('rejects a missing or malformed token with 401', async () => {
    await request(app).get('/api/rides/mine').expect(401);
    await request(app).get('/api/rides/mine').set({ Authorization: 'Bearer nonsense' }).expect(401);
  });

  it('rejects a passenger calling driver-only endpoints with 403', async () => {
    await request(app).get('/api/driver/me').set(as('Nusrat')).expect(403);
    await request(app)
      .post('/api/driver/online')
      .set(as('Nusrat'))
      .send({ isOnline: true })
      .expect(403);
  });

  it('rejects a duplicate phone number on signup with 409', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Impostor', phone: phone(2), password: 'password123', role: 'PASSENGER' });
    expect(res.status).toBe(409);
  });

  it('rejects a driver signup that omits the Tesla details', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'NoTesla', phone: phone(9), password: 'password123', role: 'DRIVER' });
    expect(res.status).toBe(400);
  });
});

describe('pooling, fares and capacity (Nusrat, Rafiq, Shirin sharing Bullet)', () => {
  let nusratRideId = '';
  let rafiqRideId = '';
  let shirinRideId = '';

  it('matches Nusrat onto Bullet at the solo fare of 7800 poisha', async () => {
    const res = await requestRide('Nusrat', 'Banani', 'Mohakhali', { paymentMethod: 'TESLAPAY' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.paymentMethod).toBe('TESLAPAY');
    expect(res.body.estimatedFarePoisha).toBe(7800); // 3000 + round(3.2 * 1500), riding alone
    expect(res.body.poolId).toBeTruthy();
    nusratRideId = res.body.id;
    poolId = res.body.poolId;
  });

  it('pools Rafiq onto the same Tesla and re-prices Nusrat to the pooled 6840', async () => {
    const res = await requestRide('Rafiq', 'Banani', 'Gulshan 1');
    expect(res.status).toBe(201);
    expect(res.body.poolId).toBe(poolId); // same pickup zone -> same Pool
    expect(res.body.estimatedFarePoisha).toBe(6000); // 3000 + 3750 - 750
    rafiqRideId = res.body.id;

    // She opened this pool and is now sharing it, so her fare is re-derived.
    const nusrat = await request(app).get(`/api/rides/${nusratRideId}`).set(as('Nusrat'));
    expect(nusrat.status).toBe(200);
    expect(nusrat.body.estimatedFarePoisha).toBe(6840); // 3000 + 4800 - 960
  });

  it('puts Shirin in the last seat and never exceeds capacity', async () => {
    const res = await requestRide('Shirin', 'Banani', 'Dhanmondi');
    expect(res.status).toBe(201);
    expect(res.body.poolId).toBe(poolId);
    expect(res.body.estimatedFarePoisha).toBe(12720); // 3000 + 12150 - 2430
    shirinRideId = res.body.id;

    const me = await request(app).get('/api/driver/me').set(as('Jashim'));
    const pool = me.body.pools.find((p: { id: string }) => p.id === poolId);
    expect(pool.seatsUsed).toBe(3);
    expect(pool.rideRequests).toHaveLength(3);
    expect(me.body.capacity).toBe(3);
  });

  it('refuses to overbook Bullet, falling back to an unmatched REQUESTED ride', async () => {
    const res = await requestRide('Karim', 'Banani', 'Farmgate');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED'); // waits for a free Tesla
    expect(res.body.poolId).toBeNull();

    await request(app).post(`/api/rides/${res.body.id}/cancel`).set(as('Karim')).expect(200);
  });

  it('lets a passenger read their own audit trail but not another passenger’s ride', async () => {
    const own = await request(app).get(`/api/rides/${nusratRideId}`).set(as('Nusrat'));
    expect(own.status).toBe(200);
    // One transition so far (REQUESTED -> MATCHED); re-pricing a fare
    // deliberately writes no status row, so the trail is not padded with noise.
    expect(own.body.statusHistory).toHaveLength(1);
    expect(own.body.statusHistory[0].toStatus).toBe('MATCHED');

    // Section 2: nobody sees anyone else's fare or status.
    await request(app).get(`/api/rides/${rafiqRideId}`).set(as('Nusrat')).expect(403);
    await request(app).get(`/api/rides/${nusratRideId}`).set(as('Rafiq')).expect(403);
  });

  it('stops a passenger cancelling someone else’s ride', async () => {
    await request(app).post(`/api/rides/${rafiqRideId}/cancel`).set(as('Nusrat')).expect(403);

    const untouched = await request(app).get(`/api/rides/${rafiqRideId}`).set(as('Rafiq'));
    expect(untouched.body.status).toBe('MATCHED'); // the 403 changed nothing
  });

  it('frees the seat when a rider cancels, and re-pools them on retry', async () => {
    await request(app).post(`/api/rides/${rafiqRideId}/cancel`).set(as('Rafiq')).expect(200);

    const me = await request(app).get('/api/driver/me').set(as('Jashim'));
    const pool = me.body.pools.find((p: { id: string }) => p.id === poolId);
    expect(pool.seatsUsed).toBe(2); // Rafiq's seat is free again

    const retry = await requestRide('Rafiq', 'Banani', 'Gulshan 1');
    expect(retry.status).toBe(201);
    expect(retry.body.poolId).toBe(poolId);
    expect(retry.body.estimatedFarePoisha).toBe(6000);
    rafiqRideId = retry.body.id;

    // Nusrat and Shirin still share the Tesla, so they keep pooled pricing.
    const nusrat = await request(app).get(`/api/rides/${nusratRideId}`).set(as('Nusrat'));
    expect(nusrat.body.estimatedFarePoisha).toBe(6840);
    const shirin = await request(app).get(`/api/rides/${shirinRideId}`).set(as('Shirin'));
    expect(shirin.body.estimatedFarePoisha).toBe(12720);
  });

  it('rejects a TeslaPay request the wallet cannot cover, without creating a ride', async () => {
    const res = await requestRide('Shanto', 'Banani', 'Farmgate', { paymentMethod: 'TESLAPAY' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Insufficient TeslaPay balance/);

    const rides = await request(app).get('/api/rides/mine').set(as('Shanto'));
    expect(rides.body).toHaveLength(0);
  });

  it('estimates solo and pooled fares before any ride is requested', async () => {
    const res = await request(app)
      .post('/api/rides/estimate')
      .set(as('Nusrat'))
      .send({ pickupZoneId: zone['Banani'], dropoffZoneId: zone['Gulshan 1'] });
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(2.5);
    expect(res.body.solo.totalFarePoisha).toBe(6750); // 3000 + 3750
    expect(res.body.pooled.totalFarePoisha).toBe(6000); // 3000 + 3750 - 750
  });
});

describe('driver acceptance, lifecycle and payments (Jashim drives Bullet)', () => {
  let pool = '';
  let nusratRide = '';
  let rafiqRide = '';
  let shirinRide = '';

  beforeAll(async () => {
    const me = await request(app).get('/api/driver/me').set(as('Jashim'));
    const forming = me.body.pools.find((p: { status: string }) => p.status === 'FORMING');
    expect(forming).toBeTruthy();
    pool = forming.id;

    const openRide = async (who: string) => {
      const res = await request(app).get('/api/rides/mine').set(as(who));
      return res.body.find((r: { status: string }) => r.status === 'MATCHED').id as string;
    };
    nusratRide = await openRide('Nusrat');
    rafiqRide = await openRide('Rafiq');
    shirinRide = await openRide('Shirin');
  });

  it('refuses driver actions that skip accepting the pool', async () => {
    const arrive = await request(app).post(`/api/driver/pools/${pool}/arrive`).set(as('Jashim'));
    expect(arrive.status).toBe(409);
    expect(arrive.body.error).toMatch(/accept the pool first/);

    await request(app).post(`/api/driver/pools/${pool}/start`).set(as('Jashim')).expect(409);
    await request(app).post(`/api/driver/pools/${pool}/complete`).set(as('Jashim')).expect(409);
  });

  it('will not let a passenger accept or operate the pool (403)', async () => {
    await request(app).post(`/api/driver/pools/${pool}/accept`).set(as('Nusrat')).expect(403);
  });

  it('runs the lifecycle: accept -> arrive -> start -> complete', async () => {
    const accept = await request(app).post(`/api/driver/pools/${pool}/accept`).set(as('Jashim'));
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('ACCEPTED');

    // Accepting locks the pool...
    await request(app).post(`/api/driver/pools/${pool}/accept`).set(as('Jashim')).expect(409);

    // ...so a late request cannot be added to a trip already agreed to.
    const late = await requestRide('Karim', 'Banani', 'Mohakhali');
    expect(late.status).toBe(201);
    expect(late.body.poolId).not.toBe(pool);

    await request(app).post(`/api/driver/pools/${pool}/arrive`).set(as('Jashim')).expect(200);
    const arrived = await request(app).get(`/api/rides/${nusratRide}`).set(as('Nusrat'));
    expect(arrived.body.status).toBe('DRIVER_ARRIVED');

    const start = await request(app).post(`/api/driver/pools/${pool}/start`).set(as('Jashim'));
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('ACTIVE');

    const complete = await request(app)
      .post(`/api/driver/pools/${pool}/complete`)
      .set(as('Jashim'));
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('COMPLETED');
  });

  it('freezes each pooled fare as final, matching docs/fare-model.md', async () => {
    const nusrat = await request(app).get(`/api/rides/${nusratRide}`).set(as('Nusrat'));
    expect(nusrat.body.status).toBe('COMPLETED');
    expect(nusrat.body.finalFarePoisha).toBe(6840);

    const rafiq = await request(app).get(`/api/rides/${rafiqRide}`).set(as('Rafiq'));
    expect(rafiq.body.finalFarePoisha).toBe(6000);

    const shirin = await request(app).get(`/api/rides/${shirinRide}`).set(as('Shirin'));
    expect(shirin.body.finalFarePoisha).toBe(12720);

    // The full audit trail of the finished trip, oldest first.
    expect(nusrat.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      'MATCHED',
      'DRIVER_ARRIVED',
      'STARTED',
      'COMPLETED',
    ]);
  });

  it('settles TeslaPay from the wallet, and cash without touching it', async () => {
    const nusrat = await request(app).get(`/api/rides/${nusratRide}`).set(as('Nusrat'));
    expect(nusrat.body.payment.method).toBe('TESLAPAY');
    expect(nusrat.body.payment.status).toBe('PAID');
    expect(nusrat.body.payment.amountPoisha).toBe(6840);

    const nusratWallet = await request(app).get('/api/wallet').set(as('Nusrat'));
    expect(nusratWallet.body.walletBalancePoisha).toBe(50000 - 6840); // 43160 poisha left

    const rafiq = await request(app).get(`/api/rides/${rafiqRide}`).set(as('Rafiq'));
    expect(rafiq.body.payment.method).toBe('CASH');
    expect(rafiq.body.payment.status).toBe('PAID');

    const rafiqWallet = await request(app).get('/api/wallet').set(as('Rafiq'));
    expect(rafiqWallet.body.walletBalancePoisha).toBe(0); // cash never touches the wallet
  });

  it('shows the driver finished trips with passengers, fares and earnings', async () => {
    const res = await request(app).get('/api/driver/history').set(as('Jashim'));
    expect(res.status).toBe(200);
    const trip = res.body.pools.find((p: { id: string }) => p.id === pool);
    expect(trip.status).toBe('COMPLETED');
    expect(trip.totalEarnedPoisha).toBe(6840 + 6000 + 12720);
    // Rafiq cancelled and re-requested, so the pool holds two of his rides
    // (one CANCELLED, one COMPLETED) - the trip's actual passengers are the
    // completed ones.
    await request(app)
      .get('/api/driver/history')
      .set(as('Jashim'))
      .expect(200)
      .then((history) => {
        const theTrip = history.body.pools.find((p: { id: string }) => p.id === pool);
        expect(
          theTrip.passengers
            .filter((p: { status: string }) => p.status === 'COMPLETED')
            .map((p: { name: string }) => p.name)
            .sort()
        ).toEqual(['Nusrat', 'Rafiq', 'Shirin']);
        expect(theTrip.passengers).toHaveLength(4); // 3 riders + Rafiq's cancelled ride
      });
  });

  it('refuses to cancel or re-run a finished trip', async () => {
    await request(app).post(`/api/rides/${nusratRide}/cancel`).set(as('Nusrat')).expect(409);
    await request(app).post(`/api/driver/pools/${pool}/complete`).set(as('Jashim')).expect(409);
    await request(app).post(`/api/driver/pools/${pool}/start`).set(as('Jashim')).expect(409);
  });
});

describe('concurrency: two riders racing for the same last seat', () => {
  it('lets exactly one of two simultaneous requests win the only seat', async () => {
    // A second, deliberately tiny Tesla (Rocket, 1 seat) is the only online
    // candidate, so the race is deterministic: one seat, two claimants.
    await signup('Rashid', 'DRIVER', 7, {
      teslaName: 'Rocket',
      teslaPlate: 'TEST-ROCKET-01',
      teslaCapacity: 1,
    });
    await request(app).post('/api/driver/online').set(as('Rashid')).send({ isOnline: true });
    await request(app).post('/api/driver/online').set(as('Jashim')).send({ isOnline: false });

    const [a, b] = await Promise.all([
      requestRide('Karim', 'Farmgate', 'Banani'),
      requestRide('Shanto', 'Farmgate', 'Banani'),
    ]);

    expect([a.body.status, b.body.status].sort()).toEqual(['MATCHED', 'REQUESTED']);

    const winner = a.body.status === 'MATCHED' ? a : b;
    const me = await request(app).get('/api/driver/me').set(as('Rashid'));
    const pool = me.body.pools.find((p: { id: string }) => p.id === winner.body.poolId);
    expect(pool.seatsUsed).toBe(1);
    expect(me.body.capacity).toBe(1); // capacity respected exactly - never 2
  });
});
