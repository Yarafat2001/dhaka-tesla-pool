# Architecture

## Component diagram

```mermaid
flowchart LR
    subgraph Client
        Browser["Browser<br/>(Passenger / Driver)"]
    end

    subgraph Frontend["Next.js (App Router)"]
        UI["React pages<br/>login, signup, passenger, driver"]
        APIClient["lib/api.ts<br/>fetch wrapper + JWT storage"]
    end

    subgraph Backend["Node.js API (Express)"]
        Routes["Routes<br/>auth, rides, driver, zones"]
        Middleware["Middleware<br/>JWT auth, role guard, error handler"]
        Services["Services<br/>authService, rideService, driverService"]
        Domain["Domain (pure functions)<br/>fare.ts, matching.ts, stateMachine.ts"]
    end

    subgraph Data["PostgreSQL"]
        DB[("Users, Zones, Teslas,<br/>Pools, RideRequests,<br/>StatusHistory, Payments")]
    end

    Browser --> UI --> APIClient -->|HTTPS/JSON, Bearer JWT| Routes
    Routes --> Middleware --> Services
    Services --> Domain
    Services -->|Prisma Client, transactions| DB
```

## Why this shape

- **Browser -> Next.js -> Node API -> Postgres** is the exact chain required
  by Section 9. The frontend never talks to the database directly; every
  write goes through the API so business rules (capacity, fare, state
  transitions) are enforced in one place, not duplicated in the client.
- **Domain logic is separated from services.** `fare.ts`, `matching.ts`, and
  `stateMachine.ts` are pure functions with no database or HTTP dependency,
  which is what makes them unit-testable without a running Postgres
  instance (see `backend/src/__tests__`). Services (`rideService.ts`,
  `driverService.ts`) wire that pure logic to Prisma transactions and HTTP
  responses.
- **No microservices, queues, or caches.** At this scale (a few actors, an
  MVP evaluation) a single Express process and a single Postgres instance
  is the entire system. Section 9 explicitly penalizes adding Kafka/Redis/
  Kubernetes just to look advanced. The bonus doc (`scaling-bonus.md`)
  covers what changes if this genuinely had to serve 1M passengers.
- **Stateless JWT auth** means the API can be horizontally scaled later
  (Section on viral scale) without a shared session store - any instance
  can verify any token.

## Request lifecycle example (Nusrat requests a ride)

```mermaid
sequenceDiagram
    participant N as Nusrat (Browser)
    participant API as Node API
    participant DB as Postgres

    N->>API: POST /api/rides {pickupZoneId: Banani, dropoffZoneId: Mohakhali}
    API->>DB: BEGIN transaction
    API->>DB: find FORMING pools at Banani with room
    DB-->>API: none found
    API->>DB: find idle, online, sufficiently large Tesla (Bullet)
    DB-->>API: Bullet found
    API->>DB: create Pool (teslaId=Bullet, seatsUsed=1)
    API->>DB: create RideRequest (status=MATCHED, fare=calculateFare())
    API->>DB: create StatusHistory row
    API->>DB: COMMIT
    API-->>N: 201 {rideRequest}
```

When Rafiq requests two minutes later with the same pickup zone, the first
`find FORMING pools` step finds Nusrat's pool, and the atomic
`updateMany(... WHERE seatsUsed + n <= capacity)` claims a seat instead of
opening a new pool - this is the pooling behavior in one sentence.

## Driver-side lifecycle (Jashim accepts, drives, completes)

```mermaid
sequenceDiagram
    participant J as Jashim (Browser)
    participant API as Node API
    participant DB as Postgres

    J->>API: GET /api/driver/me
    API->>DB: Tesla + pools in (FORMING | ACCEPTED | ACTIVE)
    API-->>J: pool with 3 riders, seatsUsed 3/3
    J->>API: POST /api/driver/pools/:id/accept
    API->>DB: pool.status = ACCEPTED (pool locks - latecomers open a new pool)
    J->>API: POST /api/driver/pools/:id/arrive
    API->>DB: rides -> DRIVER_ARRIVED + StatusHistory rows (one transaction)
    J->>API: POST /api/driver/pools/:id/start
    API->>DB: rides -> STARTED, pool -> ACTIVE
    J->>API: POST /api/driver/pools/:id/complete
    API->>DB: rides -> COMPLETED, re-price pool, freeze finalFare (one transaction)
    API->>DB: payment per rider: TESLAPAY debits wallet, CASH records PAID
    API-->>J: pool COMPLETED
```

Out-of-order driver actions are rejected with `409` from pool-level guards
(`domain/poolStateMachine.ts`), so a stale browser tab or a double tap cannot
skip acceptance or restart a finished trip - asserted in the integration suite.

## Logging

`middleware/requestLogger.ts` writes one structured JSON line per request
(method, path, status, duration, actor) with a generated request id that is also
returned in the `x-request-id` response header and attached to unhandled 500s in
`middleware/errorHandler.ts`. That is enough to follow a ride through the
lifecycle - and to connect a bug report to the exact request that produced it -
without adding a logging framework dependency.
