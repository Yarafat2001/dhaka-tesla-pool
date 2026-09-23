/**
 * Drives the brief's 2-minute demo through the API so the screenshots have
 * something to show - the README's screenshot captions describe a *finished*
 * pooled trip (Nusrat's full audit trail, Bullet's trip history with
 * per-passenger payments and earnings) plus one pool still waiting for
 * `Accept pool`. Capturing a hand-driven database cannot be reproduced by
 * anyone else, so the state is produced by this script instead of by hand.
 *
 * Usage (with `docker compose up -d` already running and freshly seeded, i.e.
 * right after `docker compose down -v && docker compose up -d`):
 *
 *   node docs/screenshots/seed-demo.js
 *   node docs/screenshots/capture.js
 *
 * Override the API target if the stack runs elsewhere (see the root
 * `.env.example` - on this Windows host the API is published on :4100):
 *
 *   API_URL=http://localhost:4100 node docs/screenshots/seed-demo.js
 *
 * It is additive: it never deletes data, it just runs the demo story. Run it
 * against a fresh volume, otherwise earlier rides show up in the screenshots
 * alongside the story ones.
 */
const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const PASSWORD = 'password123';

const CAST = {
  jashim: '01710000001',
  nusrat: '01710000002',
  rafiq: '01710000003',
  shirin: '01710000004',
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (poisha) => `৳${(poisha / 100).toFixed(2)}`;

async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

const login = (phone) => call('POST', '/api/auth/login', { phone, password: PASSWORD });

/** The demo story: Nusrat opens a pool, Rafiq and Shirin fill Bullet's 3 seats. */
async function runDemo() {
  const zones = await call('GET', '/api/zones');
  const zone = (name) => {
    const found = zones.find((z) => z.name === name);
    if (!found) throw new Error(`seeded zone "${name}" is missing`);
    return found.id;
  };

  const jashim = await login(CAST.jashim);
  const nusrat = await login(CAST.nusrat);
  const rafiq = await login(CAST.rafiq);
  const shirin = await login(CAST.shirin);

  console.log('Jashim goes online (Bullet, 3 seats)');
  await call('POST', '/api/driver/online', { isOnline: true }, jashim.token);

  const legs = [
    ['Nusrat', nusrat, 'Banani', 'Mohakhali', 'TESLAPAY'],
    ['Rafiq', rafiq, 'Banani', 'Gulshan 1', 'CASH'],
    ['Shirin', shirin, 'Banani', 'Dhanmondi', 'CASH'],
  ];
  for (const [name, actor, from, to, paymentMethod] of legs) {
    const ride = await call(
      'POST',
      '/api/rides',
      {
        pickupZoneId: zone(from),
        dropoffZoneId: zone(to),
        seats: 1,
        paymentMethod,
      },
      actor.token,
    );
    console.log(
      `${name}: ${from} -> ${to}, 1 seat, ${paymentMethod} - status ${ride.status}, ` +
        `estimate ${money(ride.estimatedFarePoisha)}`,
    );
  }

  const tesla = await call('GET', '/api/driver/me', undefined, jashim.token);
  const pool = tesla.pools[0];
  if (!pool) throw new Error('no active pool for Bullet - did the requests match?');
  console.log(`Pool ${pool.status} with ${pool.seatsUsed}/${tesla.capacity} seats (re-priced once pooled):`);
  for (const ride of pool.rideRequests) {
    console.log(`  ${ride.passenger.name.padEnd(6)} ${money(ride.estimatedFarePoisha)}`);
  }

  for (const action of ['accept', 'arrive', 'start', 'complete']) {
    await call('POST', `/api/driver/pools/${pool.id}/${action}`, undefined, jashim.token);
    console.log(`Jashim: ${action}`);
    await wait(400); // keeps the audit-trail timestamps distinct in the screenshot
  }

  // One more request, deliberately left FORMING: this is the pool waiting for
  // `Accept pool` on the driver screen shot.
  const waiting = await call(
    'POST',
    '/api/rides',
    {
      pickupZoneId: zone('Banani'),
      dropoffZoneId: zone('Farmgate'),
      seats: 1,
      paymentMethod: 'CASH',
    },
    rafiq.token,
  );
  console.log(`Rafiq: Banani -> Farmgate left waiting for acceptance (status ${waiting.status})`);

  const history = await call('GET', '/api/driver/history', undefined, jashim.token);
  const completed = history.pools[0];
  if (!completed) throw new Error('trip history is empty - the pool was never completed');
  console.log(`Bullet's trip history: ${completed.passengers.length} passengers, ${money(completed.totalEarnedPoisha)} earned`);
  for (const p of completed.passengers) {
    console.log(`  ${p.name.padEnd(6)} ${money(p.farePoisha)} ${p.paymentMethod}/${p.paymentStatus}`);
  }

  const wallet = await call('GET', '/api/wallet', undefined, nusrat.token);
  console.log(`Nusrat's TeslaPay wallet after settlement: ${money(wallet.walletBalancePoisha)}`);
}

console.log(`seeding the demo story against ${API}`);
runDemo()
  .then(() => console.log('demo state ready - now run `node docs/screenshots/capture.js`'))
  .catch((err) => {
    console.error('seed-demo failed:', err.message);
    console.error('Is the stack up (`docker compose up -d`) and freshly seeded (`docker compose down -v && docker compose up -d`)?');
    process.exit(1);
  });
