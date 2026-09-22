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

- Passenger signup/login, ride request (pickup/dropoff/seats), live fare
  estimate, status tracking (`REQUESTED -> MATCHED -> DRIVER_ARRIVED ->
  STARTED -> COMPLETED`, or `CANCELLED`), ride history, cancel-while-valid.
- Driver signup (creates their Tesla), online/offline toggle, view active
  pool with all passengers/seats/fares, arrive/start/complete actions.
- Pooling: two compatible requests (same pickup zone) share one Tesla,
  seats never exceed capacity, each passenger gets their own fare.
- Full audit trail (`StatusHistory`) per ride request.
- Seed data and demo credentials use the brief's own cast throughout:
  Jashim/Bullet, Nusrat, Rafiq, Shirin.

## Architecture & ERD

See [`docs/architecture.md`](docs/architecture.md) (component diagram +
request-lifecycle sequence diagram) and [`docs/erd.md`](docs/erd.md)
(entity-relationship diagram + modeling rationale).

## Tech stack

| Layer | Choice | Alternatives considered | Why this fits an MVP | What would make me switch |
|---|---|---|---|---|
| Backend | Express + TypeScript | NestJS, Fastify | NestJS's DI/module ceremony buys little at this scope; Fastify is faster but Express's middleware ecosystem and familiarity matter more for a 1-week MVP | A larger team / more modules would make NestJS's structure earn its overhead |
| DB | PostgreSQL | MySQL, SQLite | Matches the brief's own recommendation for pooling/capacity constraints; strong transactional guarantees needed for the seat-claim (see `docs/concurrency.md`) | N/A at this scale - Postgres scales far past MVP needs |
| ORM | Prisma | TypeORM, raw SQL/knex | Type-safe queries, first-class migrations, and `$transaction` map directly onto the concurrency requirement | Very high-throughput hot paths might drop to raw SQL for the single seat-claim query |
| Auth | JWT | Session + Redis store | Stateless, no extra infra container in Docker Compose, fits a small API | A product needing instant token revocation would need sessions or short-lived + refresh tokens |
| Frontend | Next.js (App Router) + plain CSS | Create React App, heavy UI kit (MUI etc.) | Brief recommends Next.js; plain CSS keeps the bundle small and every style decision explicit for an interview walkthrough | A larger design system would justify a component library |
| Tests | Jest (+ Supertest available) | Vitest, Mocha | Standard, zero-config with ts-jest, well understood | N/A |
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
│   │   ├── migrations/         # hand-authored SQL (see Known Limitations)
│   │   └── seed.ts             # Jashim/Bullet/Nusrat/Rafiq/Shirin + zones
│   └── src/
│       ├── domain/             # pure, unit-tested business logic
│       ├── services/           # Prisma-backed orchestration
│       ├── routes/             # Express routers
│       ├── middleware/         # auth, error handling
│       └── __tests__/          # 25 passing tests
├── frontend/
│   └── app/                    # Next.js App Router pages
├── docs/                       # architecture, ERD, fare model, concurrency, scaling
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

```bash
cd backend
npm test
```

25 tests, all passing: fare calculation (including the exact Nusrat/Rafiq
figures), pool matching rule, ride lifecycle state machine, and the
concurrency proof (naive vs. atomic seat claiming).

## Demo credentials

All seeded passwords are `password123`.

| Role | Name | Phone |
|---|---|---|
| Driver | Jashim (owns Bullet, capacity 3) | 01710000001 |
| Passenger | Nusrat | 01710000002 |
| Passenger | Rafiq | 01710000003 |
| Passenger | Shirin | 01710000004 |

## API overview

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | - | Create passenger or driver (driver also creates their Tesla) |
| POST | `/api/auth/login` | - | Returns JWT |
| GET | `/api/zones` | - | List predefined Dhaka zones |
| POST | `/api/rides` | Passenger | Request a ride, attempts pool match |
| GET | `/api/rides/mine` | Passenger | This passenger's ride history |
| GET | `/api/rides/:id` | Passenger (owner only) | One ride's detail |
| POST | `/api/rides/:id/cancel` | Passenger (owner only) | Cancel while cancellable |
| POST | `/api/driver/online` | Driver | Toggle online/offline |
| GET | `/api/driver/me` | Driver | Tesla + active pool + passengers |
| POST | `/api/driver/pools/:poolId/arrive` | Driver (owner only) | -> DRIVER_ARRIVED |
| POST | `/api/driver/pools/:poolId/start` | Driver (owner only) | -> STARTED |
| POST | `/api/driver/pools/:poolId/complete` | Driver (owner only) | -> COMPLETED, freezes fares |

## Key decisions & trade-offs

- Pool is the unit of a physical trip (not a separate "Ride" entity) - see
  `docs/erd.md` for the full rationale.
- Each pooled passenger pays for their own distance with a discount, not an
  even split of a combined fare - see `docs/fare-model.md`.
- Seat capacity is enforced by one atomic conditional `UPDATE`, not
  application-level read-then-write - see `docs/concurrency.md`.
- Money is integer poisha throughout, never float/decimal.

## Known limitations

- **Prisma migration was hand-authored, not generated.** The sandbox this
  was built in only allows a fixed set of package-registry domains; the
  Prisma query-engine binary download (from `binaries.prisma.sh`) was
  blocked. The SQL in `backend/prisma/migrations/20260101000000_init/`
  was written by hand to match `schema.prisma` exactly and reviewed
  line-by-line against it. In the Docker container (which has normal
  internet access) `prisma generate`/`migrate deploy` run exactly as they
  would anywhere else - this is a sandbox artifact, not a design choice.
- No real payment gateway (simulated TeslaPay wallet / cash only, per
  Section 5).
- No real map/routing - a predefined zone list + distance matrix, per
  Section 4.
- Multi-seat bookings scale seat usage but not fare (documented in
  `docs/fare-model.md`).
- Frontend has minimal styling by design (Section 6: "a simple, clean
  interface is enough") - no component library.

## Next improvements

- Real geospatial matching instead of exact zone equality (see
  `docs/scaling-bonus.md`).
- Driver ratings, passenger ratings.
- Push/real-time status updates instead of polling.
- Refund/dispute flow for post-STARTED cancellations.

## AI Usage

Tools used: Claude (Anthropic), used throughout for scaffolding the
Express/Prisma backend, the Next.js frontend, Docker configuration, tests,
and this documentation, working from the assignment brief.

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

## Demo video

_Link to be added: 6-minute Loom covering problem understanding,
engineering walkthrough (architecture/ERD/lifecycle/one key decision/one
trade-off), and a product tour._

## Deployment

Public deployment link to be added once a confirmed free-tier backend host
is set up; the Docker Compose setup above is a fully reproducible
alternative deployment per Section 6.

## Version

`v1.0.0` — MVP scope per the assignment brief (Sections 1-19). See git
history: `master` holds integrated feature work, `pre-release` carries
integration/doc fixes, `release/v1.0.0` is the tagged submission point.
