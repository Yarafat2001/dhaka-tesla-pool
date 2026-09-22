# Deployment

Section 6 asks for a free/free-tier deployment, or a documented constraint plus a
reproducible Docker path. This repo does both: the Docker Compose setup below is
what was actually run and verified for the demo, and the free-tier options are
spelled out so a deployment can be stood up in minutes without paying for
anything.

## 1. Docker Compose (verified, reproducible anywhere Docker runs)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

What that gives you:

| Service | Image | Port | Start-up behaviour |
|---|---|---|---|
| `db` | `postgres:16-alpine` | 5432 | healthcheck via `pg_isready` |
| `api` | built from `backend/Dockerfile` | 4000 (host port configurable) | waits for the db healthcheck, then `prisma migrate deploy` → `npm run seed` → `npm start` |
| `web` | built from `frontend/Dockerfile` | 3000 | `next start` against the baked-in `NEXT_PUBLIC_API_URL` |

The API container waits on the database's healthcheck (`condition:
service_healthy`) before migrating, so `docker compose up` is a single,
order-correct command - no "wait for Postgres then re-run" dance.

### Host port overrides

Host ports can collide with services already running on a machine (Windows
reserves ranges for Hyper-V/WinNAT, for example). Both published ports are
therefore overridable without editing the compose file:

```bash
# repo-root .env
API_HOST_PORT=4100     # default 4000
WEB_HOST_PORT=3000     # default 3000
```

Because Next.js inlines `NEXT_PUBLIC_*` at **build** time, the override has to
reach the web build as well - the compose `environment:` value alone does not do
it:

1. set `API_HOST_PORT=4100` in the repo-root `.env` (compose publishes the API
   there),
2. set `NEXT_PUBLIC_API_URL=http://localhost:4100` in `frontend/.env` (Next.js
   reads it when the bundle is built), and
3. rebuild the web image: `docker compose up -d --build web`.

Skipping step 2 produces a web app that builds and serves fine but calls port
4000 in the browser - a confusing failure, and exactly the one this escape hatch
exists to avoid. The committed `frontend/.env.example` keeps the default 4000,
so a normal `docker compose up --build` needs no thought.

## 2. Free-tier hosting (no payment required)

The API is a stateless Express process (JWT, no server-side session) and the web
app is a standard Next.js build, so any container host works. Both options below
have free tiers that are enough for a demo.

### Option A - Render (web + API) with Neon (Postgres)

1. Create a free Postgres database at <https://neon.tech> and copy its
   connection string (append `?schema=public`).
2. On Render, create a **Web Service** from this repo:
   - Runtime: Docker, Dockerfile path: `backend/Dockerfile`
   - Environment variables:
     - `DATABASE_URL` = the Neon connection string
     - `JWT_SECRET` = a long random string (never commit it)
     - `PORT` = `4000`
   - Health check path: `/health`
   - The container runs `prisma migrate deploy && npm run seed && npm start`, so
     the schema and demo data are provisioned on first boot.
3. Create a second **Web Service** for the frontend:
   - Runtime: Docker, Dockerfile path: `frontend/Dockerfile`
   - Build-time variable: `NEXT_PUBLIC_API_URL` = the API service URL from step 2
     (it must be set **before** the build, because Next.js inlines it).
4. Note the two public URLs in the README's deployment section.

Both free tiers sleep when idle; the first request after a sleep takes a few
seconds. That is acceptable for a demo and free of charge.

### Option B - Fly.io

```bash
fly launch --dockerfile backend/Dockerfile --name dhaka-tesla-pool-api
fly secrets set DATABASE_URL="<neon-or-fly-postgres-url>" JWT_SECRET="<random>"
fly deploy
```

Fly's free allowance changes over time, and Postgres is not free by default - if
it is no longer free, use Neon (Option A) for the database and keep the API on
Fly/Render. This is exactly the kind of "read the current pricing page before
committing" check worth doing rather than assuming.

## 3. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string |
| `JWT_SECRET` | backend | signs/verifies JWTs - set a long random value in any real deployment |
| `PORT` | backend | API port (default 4000) |
| `NEXT_PUBLIC_API_URL` | frontend (`frontend/.env`) | API base URL, inlined at build time - rebuild the web image after changing it |
| `API_HOST_PORT` / `WEB_HOST_PORT` | repo root (compose only) | host port overrides |

Real secrets never belong in the repo: `backend/.env` and `frontend/.env` are
gitignored, and only the `.env.example` files are committed.

## 4. Verifying a deployment

```bash
curl https://<api-host>/health            # {"status":"ok"}
curl https://<api-host>/api/zones         # the seeded Dhaka zones
```

Then sign in on the web app as Nusrat (`01710000002` / `password123`) and request
Banani → Mohakhali, and as Jashim (`01710000001`) to accept and complete the trip.

## 5. Not done here, and why

- No paid infrastructure was used for this challenge, per Section 16.
- No Kubernetes, autoscaling or managed queues: at this scale they would add
  moving parts without evidence they are needed (Section 9). What would change at
  real scale is reasoned through in `docs/scaling-bonus.md`.
