# Dhaka Tesla Pool

Share a seat. Split the fare. Survive Dhaka traffic.

## Summary / Problem Statement

Nusrat wants to get from Banani to Mohakhali. Rafiq wants to get from Banani
to Gulshan 1, two minutes later. Jashim's Bullet (a 3-seat battery "Tesla")
can carry both if the app can match them, split their fares fairly, and
track the trip's lifecycle without either passenger seeing the other's
fare. This repo is an MVP of that: passengers request rides, compatible
requests pool onto one Tesla up to its seat capacity, drivers run the
lifecycle from acceptance to completion, and every status change is kept as
history.

## Features implemented

- Passenger signup/login, ride request (pickup/dropoff/seats), **live fare
  estimate before booking** (solo vs. shared price), status tracking
  (`REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED`, or
  `CANCELLED`), ride history, cancel-while-valid, and a per-ride "what happened?"
  audit trail.
- Driver signup (creates their Tesla), online/offline toggle, view the active
  pool with all passengers/seats/fares, **accept** a pool, arrive/start/complete
  actions, and trip history with per-trip earnings.
- Pooling: two compatible requests (same pickup zone) share one Tesla, seats
  never exceed capacity, each passenger gets their own fare, and **fares are
  re-derived whenever pool membership changes** (so the passenger who opens a
  pool also gets the shared-ride discount once somebody joins).
- Payments (Section 5): each ride is booked as `CASH` or the simulated
  `TESLAPAY` wallet, the wallet can be topped up, and a `Payment` row is settled
  when the trip completes (TeslaPay debits the wallet; cash does not).
- Full audit trail (`StatusHistory`) per ride request, exposed to its owner.
- Structured request logging with a correlation id (`x-request-id`).
- Seed data and demo credentials use the brief's own cast throughout:
  Jashim/Bullet, Nusrat, Rafiq, Shirin - and the tests use the same cast.

## Architecture & ERD

See [`docs/architecture.md`](docs/architecture.md) (component diagram, passenger
and driver lifecycle sequence diagrams) and [`docs/erd.md`](docs/erd.md)
(entity-relationship diagram + modeling rationale).

## Screenshots

The four screens below are the whole product surface. Run
`docker compose up --build`, then sign in with the demo credentials further down
to reproduce them.

| Screen | What to look for |
|---|---|
| ![Login](docs/screenshots/01-login.png) | Seeded demo cast listed on the login screen |
| ![Passenger](docs/screenshots/02-passenger.png) | Live fare estimate (solo vs. shared), payment method, wallet balance, ride list with statuses |
| ![Audit trail](docs/screenshots/03-ride-audit-trail.png) | "What happened on this ride?" - every status change for one ride |
| ![Driver](docs/screenshots/04-driver.png) | Bullet's 3 seats, a pool waiting for acceptance (`Accept pool`), and trip history with per-passenger payments and earnings |

> These are real captures from the running stack, not mockups, and they are
> committed - the README renders them without any manual step. To regenerate
> them (or capture your own GIF), `docs/screenshots/README.md` has the exact
> steps.

## Assumptions

Requirements are deliberately open in places (Section 17). What was assumed
here, and why:

- **Matching rule:** same *pickup zone* (dropoff zones may differ). Rationale and
  the worked Nusrat/Rafiq case are in [Matching rule](#matching-rule) below and
  in `backend/src/domain/matching.ts`.
- **Matching is automatic, acceptance is explicit.** The matcher assigns a
  request to the first compatible Tesla; the driver then *accepts* the pool
  before arriving. Auto-assignment avoids a dispatch UI nobody asked for, but
  acceptance is kept because Section 3 lists it as a driver capability and it
  gives the pool a real "locked" moment.
- **A pool locks when the driver accepts.** Late compatible requests open a new
  pool rather than changing a trip the driver already agreed to drive.
- **Fares are estimates until completion.** Re-pricing as the pool fills is
  deliberate (see `docs/fare-model.md`); `finalFarePoisha`, frozen at
  `COMPLETED`, is what the passenger is charged.
- **Distances come from a seeded zone matrix**, not a routing API (Section 4
  explicitly allows this), so fares are hand-verifiable.
- **Money is integer poisha** end to end (`docs/fare-model.md`).
- **Simulated TeslaPay**, not a real gateway: wallets are topped up through
  `POST /api/wallet/topup` and debited at completion (Section 5).
- **Single Postgres, single API process.** Section 9 asks for complexity only
  when there is a reason; `docs/scaling-bonus.md` reasons through 1M passengers.

## Tech stack

| Layer | Choice | Alternatives considered | Why this fits an MVP | What would make me switch |
|---|---|---|---|---|
| Backend | Express + TypeScript | NestJS, Fastify | NestJS's DI/module ceremony buys little at this scope; Fastify is faster but Express's middleware ecosystem and familiarity matter more for a 1-week MVP | A larger team / more modules would make NestJS's structure earn its overhead |
| DB | PostgreSQL | MySQL, SQLite | Matches the brief's own recommendation for pooling/capacity constraints; strong transactional guarantees needed for the seat-claim (see `docs/concurrency.md`) | N/A at this scale - Postgres scales far past MVP needs |
| ORM | Prisma | TypeORM, raw SQL/knex | Type-safe queries, first-class migrations, and `$transaction` map directly onto the concurrency requirement | Very high-throughput hot paths might drop to raw SQL for the single seat-claim query |
| Auth | JWT | Session + Redis store | Stateless, no extra infra container in Docker Compose, fits a small API | A product needing instant token revocation would need sessions or short-lived + refresh tokens |
| Frontend | Next.js (App Router) + plain CSS | Create React App, heavy UI kit (MUI etc.) | Brief recommends Next.js; plain CSS keeps the bundle small and every style decision explicit for an interview walkthrough | A larger design system would justify a component library |
| Tests | Jest, plus Supertest for the API/DB integration suite | Vitest, Mocha | Standard, zero-config with ts-jest, well understood; Supertest exercises the real Express app against real Postgres for the tests that pure units can't prove (authorization, live concurrency) | N/A |
| Hosting | Docker Compose (local reproducible deploy) | Free-tier PaaS (Render/Railway) | Guaranteed free, zero external dependency, evaluator runs `docker compose up` and it works | A public deployment link once a free backend host is confirmed working, per Section 6 |

## Fare model

See [`docs/fare-model.md`](docs/fare-model.md) for the formula, the
Nusrat/Rafiq worked example (hand-verifiable), and why money is stored as
integer poisha.

## Matching rule

Two requests are pool-compatible if they share the same **pickup zone**
(dropoff zones may differ) - see `backend/src/domain/matching.ts`. A
request only actually joins a pool if the Tesla also has enough free seats,
checked atomically at claim time (see Concurrency below).

## Concurrency

See [`docs/concurrency.md`](docs/concurrency.md) for the full writeup of
the Nusrat-vs-Shirin last-seat race and why an atomic conditional `UPDATE`
(not a read-then-write) is what actually prevents overbooking. The
underlying pattern is proven in isolation in
`backend/src/__tests__/concurrency.test.ts`.

## Project structure

```
dhaka-tesla-pool/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # data model
│   │   ├── migrations/         # 3 migrations (init, payments, pool ACCEPTED)
│   │   └── seed.ts             # Jashim/Bullet/Nusrat/Rafiq/Shirin + zones + wallets
│   └── src/
│       ├── domain/             # pure, unit-tested business logic
│       │                        # fare, matching, ride + pool state machines,
│       │                        # payment settlement, capacity guard
│       ├── services/           # Prisma-backed orchestration
│       ├── routes/             # Express routers (auth, rides, driver, wallet, zones)
│       ├── middleware/         # auth, error handling, request logging
│       └── __tests__/          # 41 unit tests + 22 API integration tests
├── frontend/
│   ├── app/                    # Next.js App Router pages (login, signup, passenger, driver)
│   └── lib/api.ts              # typed API client + JWT storage
├── docs/                       # architecture, ERD, fare model, concurrency,
│                                # scaling bonus, deployment, screenshots
└── docker-compose.yml
```

## Prerequisites

- Docker + Docker Compose (recommended path)
- Or, for local dev without Docker: Node.js 20+, a local Postgres instance

## Environment variables

Copy the example files - never commit real secrets:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env.example`:
```
DATABASE_URL="postgresql://tesla_pool:tesla_pool_dev@db:5432/dhaka_tesla_pool?schema=public"
JWT_SECRET="replace-with-a-long-random-string-in-real-deployments"
PORT=4000
```

`frontend/.env.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

`.env.example` (root, **optional** - only for host-port overrides):

```
API_HOST_PORT=4000
WEB_HOST_PORT=3000
```

The compose file already defaults to those two values, so the root `.env` is
only needed when a host port is unavailable. If you change `API_HOST_PORT`, also
point `NEXT_PUBLIC_API_URL` in `frontend/.env` at the same port, because the
browser calls the API directly. This is exactly the portability escape hatch
documented in `docs/deployment.md`: on the Windows machine this was developed
on, Hyper-V/WinNAT reserves TCP `3998-4097`, so `4000` cannot be bound and the
stack runs on `4100` without any code change.

`.env` files are gitignored; only the `.env.example` files are committed.

## Running with Docker (recommended)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

This starts Postgres (with a healthcheck), runs migrations
(`prisma migrate deploy`) and the seed script, then starts the API on
`:4000` and the web app on `:3000`.

## Running locally without Docker

```bash
# Postgres must be running locally and DATABASE_URL updated accordingly
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev        # API on :4000

# in a second terminal
cd frontend
npm install
npm run dev         # web app on :3000
```

## Running tests

Fast, database-free unit tests (pure domain logic):

```bash
cd backend
npm test
```

41 tests, all passing: fare calculation (including the exact Nusrat/Rafiq
figures and the pool re-pricing rule), pool matching, the ride and pool state
machines, payment settlement, and the concurrency proof (naive vs. atomic seat
claiming).

API/DB integration tests (need a running Postgres, and refuse to run unless
`DATABASE_URL` points at an isolated schema so demo data is never touched):

```bash
# with the compose stack running; the tests execute inside the api image, so
# make sure that image was built from the current source
docker compose build api

docker run --rm --network dhaka-tesla-pool_default \
  -e DATABASE_URL="postgresql://tesla_pool:tesla_pool_dev@db:5432/dhaka_tesla_pool?schema=test" \
  -e JWT_SECRET=integration-test-secret \
  dhaka-tesla-pool-api:latest \
  sh -c "npx prisma migrate deploy && npm run test:integration"
```

Because compose publishes Postgres on `:5432`, the same suite can be run straight
from the host instead, which is quicker while iterating:

```bash
cd backend
DATABASE_URL="postgresql://tesla_pool:tesla_pool_dev@localhost:5432/dhaka_tesla_pool?schema=test" \
JWT_SECRET=integration-test-secret npm run test:integration
```

`test:integration` uses `jest.integration.config.js`, which only picks up
`**/__tests__/**/*.integration.test.ts` and fails if
`DATABASE_URL` is not pointed at a `test` schema - the guard exists so a careless
`npm test` can never truncate the demo data the README refers to.

22 tests, all passing - including the two the brief calls out explicitly: a
passenger cannot read or cancel another passenger's ride (`403`, state
unchanged), and two simultaneous requests for the same last seat produce exactly
one `MATCHED` with `seatsUsed` never exceeding capacity.

## Demo credentials

All seeded passwords are `password123`. Passengers are seeded with a
**৳500.00 TeslaPay wallet** so the TeslaPay payment path can be exercised
immediately (top up further from the passenger screen).

| Role | Name | Phone | Notes |
|---|---|---|---|
| Driver | Jashim | 01710000001 | owns Bullet, capacity 3, seeded online |
| Passenger | Nusrat | 01710000002 | ৳500.00 TeslaPay wallet |
| Passenger | Rafiq | 01710000003 | ৳500.00 TeslaPay wallet |
| Passenger | Shirin | 01710000004 | ৳500.00 TeslaPay wallet |

**The 2-minute demo:** sign in as Nusrat, request Banani → Mohakhali (the screen
shows the solo price and the shared price before you commit), then as Rafiq
request Banani → Gulshan 1 - he pools onto the same Tesla and Nusrat's fare drops
to the pooled ৳68.40 (visible via "What happened on this ride?"). Sign in as
Jashim to see 3/3 seats, accept the pool, arrive, start, complete; the trip then
appears in his history with ৳255.60 earned (৳68.40 + ৳60.00 + ৳127.20).

## API overview

Ride lifecycle: `REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED`,
or `CANCELLED` from any pre-`STARTED` state. Pool lifecycle (driver side):
`FORMING -> ACCEPTED -> ACTIVE -> COMPLETED` - a pool accepts new riders only
while `FORMING`, and locks once the driver accepts it.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | - | Create passenger or driver (driver also creates their Tesla) |
| POST | `/api/auth/login` | - | Returns JWT |
| GET | `/api/zones` | - | List predefined Dhaka zones |
| POST | `/api/rides/estimate` | Passenger | Fare preview: distance, solo price, pooled price |
| POST | `/api/rides` | Passenger | Request a ride (with `paymentMethod`), attempts pool match |
| GET | `/api/rides/mine` | Passenger | This passenger's ride history |
| GET | `/api/rides/:id` | Passenger (owner only) | Ride detail + payment + own `StatusHistory` |
| POST | `/api/rides/:id/cancel` | Passenger (owner only) | Cancel while cancellable |
| GET | `/api/wallet` | Passenger | Simulated TeslaPay balance |
| POST | `/api/wallet/topup` | Passenger | Simulated top-up (`amountPoisha`) |
| POST | `/api/driver/online` | Driver | Toggle online/offline |
| GET | `/api/driver/me` | Driver | Tesla + active pools (FORMING/ACCEPTED/ACTIVE) + passengers |
| GET | `/api/driver/history` | Driver | Finished trips with passengers, fares, payments, earnings |
| POST | `/api/driver/pools/:poolId/accept` | Driver (owner only) | -> ACCEPTED (locks the pool) |
| POST | `/api/driver/pools/:poolId/arrive` | Driver (owner only) | -> DRIVER_ARRIVED |
| POST | `/api/driver/pools/:poolId/start` | Driver (owner only) | -> STARTED |
| POST | `/api/driver/pools/:poolId/complete` | Driver (owner only) | -> COMPLETED, freezes fares, settles payments |
| GET | `/health` | - | Health probe (used by the container healthcheck) |

Errors are consistently `{ "error": "<message>" }` with meaningful status codes
(`400` validation, `401` unauthenticated, `403` not your resource, `409`
illegal state transition, `404` unknown ride/pool).

## Key decisions & trade-offs

- Pool is the unit of a physical trip (not a separate "Ride" entity) - see
  `docs/erd.md` for the full rationale.
- Each pooled passenger pays for their own distance with a discount, not an
  even split of a combined fare - see `docs/fare-model.md`.
- Seat capacity is enforced by one atomic conditional `UPDATE`, not
  application-level read-then-write - see `docs/concurrency.md`.
- Money is integer poisha throughout, never float/decimal.

## Known limitations

- **Migrations:** `20260101000000_init` was hand-authored, not generated - the
  sandbox this was first written in blocked the Prisma engine download (details
  are in that file's header). The two later migrations
  (`20260923000001_ride_payment_method`, `20260923000002_pool_accepted_status`)
  *are* Prisma-generated DDL, produced with `prisma migrate diff` against a
  shadow database inside the Docker image. All three apply cleanly with
  `prisma migrate deploy` - verified on a fresh volume and in the isolated test
  schema.
- **No real payment gateway.** TeslaPay is a simulated wallet
  (`POST /api/wallet/topup` credits it, completion debits it) per Section 5.
- **A failed TeslaPay settlement is recorded, not chased.** If a wallet cannot
  cover the frozen fare at completion, the trip still completes (it physically
  happened) and the `Payment` row is marked `FAILED`; there is no dunning,
  refund or dispute flow. Requests are validated up front, so this only happens
  if the wallet is spent between request and completion.
- **No real map/routing** - a predefined zone list plus a seeded distance
  matrix, per Section 4. Zone-to-zone distances exist only for the demo pairs.
- **Multi-seat bookings scale seat usage but not fare** (documented in
  `docs/fare-model.md`).
- **Polling, not push.** Screens refresh on action; there is no WebSocket/SSE
  layer yet (see `docs/scaling-bonus.md`).
- **No rate limiting or idempotency keys** on the public endpoints; both are
  reasoned through in the scaling doc rather than built here.
- **Frontend has minimal styling by design** (Section 6: "a simple, clean
  interface is enough") - plain CSS, no component library.
- **The demo video is the one manual step left** (Section 13) - everything else,
  including the screenshots, is committed and reproducible. See
  [Demo video](#demo-video).

## Next improvements

- Real geospatial matching instead of exact zone equality (see
  `docs/scaling-bonus.md`).
- Driver ratings, passenger ratings.
- Push/real-time status updates instead of polling.
- Refund/dispute flow for post-STARTED cancellations.

## AI Usage

Tools used: **Claude** (Anthropic) for the bulk of the scaffolding - the
Express/Prisma backend, Next.js frontend, Docker configuration, tests, and
documentation - working from the assignment brief; and **Cline** (the VS Code
agent, also Claude-backed) for the verification, debugging and fix passes
described below. No part of the system was left unread: every file here has been
run, and the failures found by running it are listed as bugs below rather than
tidied away.

- **One accepted suggestion:** modeling `Pool` as the unit of a physical
  trip (with `RideRequest.poolId` nullable until matched) rather than a
  separate `Ride` table wrapping `RideRequest`s. This turned "multiple
  requests may share one Tesla" into a direct consequence of the schema
  instead of application-level bookkeeping, and made the pool-discount fare
  logic and the seat-capacity constraint both attach naturally to one row.
- **One rejected/changed suggestion:** the fare model was initially going
  to split one combined pool fare evenly across passengers. This was
  rejected because Nusrat and Rafiq travel different distances - an even
  split would overcharge the shorter leg or undercharge the longer one.
  Changed to per-passenger distance-based fare with a discount instead of a
  split, which is what's implemented and tested.
- **Bugs the AI-written code had, found by running it** (not by reading it):
  - The first version priced a ride once, at request time, so the passenger who
    *opened* a pool kept paying the undiscounted solo fare (৳78.00) while the
    passenger who joined got 20% off (৳60.00) - contradicting the worked example
    in `docs/fare-model.md`. Fares are now re-derived from current pool
    membership (`repricePoolFares`), the documented ৳68.40 for Nusrat holds live,
    and both the unit tests and the API integration suite assert it.
  - The API container's healthcheck used `wget`, which does not exist in
    `node:20-slim`, so the API could never report healthy. It now probes with
    Node's built-in `fetch`.
  - "Complete trip" fired payments only for the requesting ride, leaving fellow
    pool members unsettled - the `Payment` table stayed empty. Completion now
    settles every non-cancelled ride in the pool.
- **What running it caught that the docs had wrong:** the README's demo
  walkthrough originally claimed ৳291.60 of driver earnings for the
  three-passenger story. Summing the fares the system actually charges -
  Nusrat 6840 + Rafiq 6000 + Shirin 12720 = 25560 poisha - gives ৳255.60, so
  the walkthrough was corrected against live output rather than left plausible
  but wrong. The hand-check is: Shirin's Banani → Dhanmondi leg is 8.1 km, so
  `3000 + round(8.1 × 1500) = 15150` solo, minus the 20% distance discount
  `round(12150 × 0.2) = 2430` → **12720**. Section 16 warns against polishing
  the frontend while data integrity is broken; the same applies to docs that
  drift from behaviour, which is why these figures are asserted in tests where
  possible and re-verified against the running stack where not.

## Demo video

_Link to be added: 6-minute Loom covering problem understanding,
engineering walkthrough (architecture/ERD/lifecycle/one key decision/one
trade-off), and a product tour._

## Deployment

No paid infrastructure was used (Section 16). The reproducible deployment is the
Docker Compose setup documented above; **[`docs/deployment.md`](docs/deployment.md)**
adds concrete free-tier steps (Render web services + Neon Postgres, or Fly.io),
the environment variables each one needs, and how to verify a deployment.

A public URL would be added here once a free tier is provisioned - that is the
one step in this repo that needs a human with an account, which is why the
constraint is documented rather than hidden.

## Version

`v1.0.0` — MVP scope per the assignment brief (Sections 1-19), including
pooling, the full ride lifecycle with driver acceptance, cash/TeslaPay
settlement, and both test suites.

Branch story: feature work lands on `feature/*` (or `fix/*`, `test/*`, `docs/*`)
branches with one logical change per commit, merges into `master`, is
integration-checked on `pre-release`, and is cut as `release/v1.0.0` — the
tagged submission point that the demo video and this README describe.
