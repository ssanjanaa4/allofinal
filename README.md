# Allofinal Inventory Reservations

Production-grade Next.js 15 App Router service for inventory lookup and stock reservations.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run prisma:migrate
npm run prisma:seed
```

## Reservation Expiry Cleanup

Reservations hold stock by incrementing `Inventory.reservedStock`. A reservation is available until `expiresAt`; once expired, it must release that held quantity exactly once.

This app uses the best practical Vercel approach:

- `vercel.json` schedules `/api/cron/expire-reservations` every 5 minutes.
- The cron route calls `cleanupExpiredReservations`.
- Cleanup selects pending expired rows with `SELECT ... FOR UPDATE SKIP LOCKED`.
- Each selected row is marked `EXPIRED` and its quantity is decremented from `reservedStock` in the same transaction.
- `SKIP LOCKED` makes the cleanup horizontally scalable: overlapping cron invocations or future workers skip rows already being processed.
- Confirm/release flows also perform lazy expiry for the reservation they touch, so stale holds are cleaned even between cron runs.

Set `CRON_SECRET` in production. Vercel should call the cron endpoint with:

```http
Authorization: Bearer <CRON_SECRET>
```

Without `CRON_SECRET`, the cron route only allows unauthenticated access outside production.

## Stock Formula

```txt
availableStock = totalStock - reservedStock
```

Confirming a reservation decrements both `totalStock` and `reservedStock`. Releasing or expiring a reservation decrements only `reservedStock`.
