# Allofinal Inventory Reservations

A production-ready Next.js 15 App Router application for inventory management and stock reservation.

## Architecture Overview

- **Frontend:** Next.js App Router serving server components and API routes.
- **Database:** PostgreSQL via Prisma; compatible with Supabase Postgres.
- **Cache / Idempotency:** Upstash Redis for request locks and response caching.
- **Deployment:** Vercel with scheduled cron route for expired reservations.
- **Inventory model:** `Inventory.totalStock`, `Inventory.reservedStock`, `Reservation.status`.

## Concurrency and Locking Strategy

### Reservation creation

- `createReservation` runs inside a single Prisma transaction.
- It uses `SELECT ... FOR UPDATE` to lock the matching `Inventory` row.
- Available stock is computed as `totalStock - reservedStock` before incrementing `reservedStock`.
- Concurrent reservation attempts on the same inventory row serialize at the row lock and cannot oversell.

### Confirm / Release transitions

- `confirmReservation` and `releaseReservation` both lock:
  1. the `Reservation` row
  2. then the associated `Inventory` row
- This consistent lock order avoids deadlocks across concurrent state transitions.
- Confirming decrements both `totalStock` and `reservedStock` in one transaction.
- Releasing decrements only `reservedStock` and marks the reservation `CANCELLED`.

## Expiry Mechanism

- Reservations can include an `expiresAt` timestamp.
- The cron route at `/api/cron/expire-reservations` runs every 5 minutes via `vercel.json`.
- `cleanupExpiredReservations` selects expired `PENDING` reservations with `FOR UPDATE SKIP LOCKED`.
- Each expired reservation is marked `EXPIRED` and its reserved stock is returned to inventory atomically.
- Confirm and release routes also perform lazy expiry when they touch stale reservations.

## Idempotency Strategy

- API POST routes require an `Idempotency-Key` header.
- `withIdempotency` uses Upstash Redis to:
  - lock an in-flight request with a short TTL
  - cache the response for 24 hours
  - return the cached response on retries
- `createReservation` also supports a stable `idempotencyKey` at the reservation level so retries do not create duplicate reservations.

## Environment Variables

Required variables for production and local development:

- `DATABASE_URL` – Postgres connection string for Prisma.
- `DIRECT_URL` – optional direct database URL for immutable deployments or preview environments.
- `NEXT_PUBLIC_SUPABASE_URL` – public Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anonymous API key.
- `UPSTASH_REDIS_REST_URL` – Upstash Redis REST endpoint.
- `UPSTASH_REDIS_REST_TOKEN` – Upstash Redis REST token.
- `CRON_SECRET` – bearer token used by Vercel cron requests in production.

Create a `.env.local` from `.env.example` and keep secrets out of version control.

## Local Setup

```bash
git clone <repo-url>
cd allofinal
npm install
cp .env.example .env.local
# fill in real env values
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

### Recommended development checks

```bash
npm run lint
npm run typecheck
npm run test:concurrency
```

## Migrations and Seeding

- `npm run prisma:migrate` applies migrations to the connected database.
- `npm run prisma:seed` populates demo or initial data.
- `npm run prisma:generate` creates the Prisma client; this also runs automatically after install via `postinstall`.

## Vercel Deployment

1. Connect the GitHub repository to Vercel.
2. Add required environment variables to the Vercel project settings.
3. Ensure `vercel.json` is included in the repository so the cron route is scheduled.
4. Deploy the project; Vercel will run `npm run build`.
5. Confirm the deployed app responds and the cron route is accessible with `Authorization: Bearer <CRON_SECRET>`.

> Note: Vercel hobby accounts only allow daily cron execution. The default `*/5 * * * *` schedule requires a Pro plan or an external scheduler for production-grade expiry cadence.

## Tradeoffs

- **Pros:** row-level database locking is simple, reliable, and prevents overselling.
- **Cons:** high contention on hot inventory rows may serialize requests.
- **Redis idempotency:** protects retry storms but adds an external dependency.
- **Expiry model:** relies on a scheduled cleanup and lazy expiry checks, so short-lived holds may persist until the next cron or API touch.

## Future Improvements

- Add a dedicated worker queue or database trigger for reservation expiry.
- Add inventory ledger / audit events for every stock transition.
- Improve concurrency by sharding inventory or using optimistic locking with retries.
- Add authenticated Supabase auth and product/customer identities.
- Add more full-stack end-to-end tests for the checkout and expiry paths.

## Live App Link
http://192.168.0.129:3000 
