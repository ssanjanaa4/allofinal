import { Prisma, ReservationStatus } from "@prisma/client";

import { getAvailableStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export class InsufficientStockError extends Error {
  constructor(
    readonly availableStock: number,
    readonly requestedQuantity: number,
  ) {
    super("Insufficient stock for reservation.");
    this.name = "InsufficientStockError";
  }
}

export class ReservationNotFoundError extends Error {
  constructor(readonly reservationId: string) {
    super("Reservation not found.");
    this.name = "ReservationNotFoundError";
  }
}

export class ReservationExpiredError extends Error {
  constructor(readonly reservationId: string) {
    super("Reservation has expired.");
    this.name = "ReservationExpiredError";
  }
}

export class ReservationStateError extends Error {
  constructor(
    readonly reservationId: string,
    readonly currentStatus: ReservationStatus,
    readonly action: "confirm" | "release",
  ) {
    super("Reservation is not in a valid state for this transition.");
    this.name = "ReservationStateError";
  }
}

export type CreateReservationInput = {
  productId: string;
  warehouseId: string;
  quantity: number;
  idempotencyKey?: string | undefined;
  expiresAt?: Date | undefined;
};

type LockedReservationRow = {
  id: string;
  inventoryId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date | null;
};

type LockedInventoryRow = {
  id: string;
  totalStock: number;
  reservedStock: number;
};

const reservationInclude = {
  product: true,
  warehouse: true,
  inventory: true,
} satisfies Prisma.ReservationInclude;

export async function createReservation(input: CreateReservationInput) {
  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const existingReservation = await tx.reservation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: reservationInclude,
        });

        if (existingReservation) {
          return existingReservation;
        }
      }

      /*
       * Locking strategy:
       * PostgreSQL's SELECT ... FOR UPDATE takes an exclusive row-level lock on
       * the matching Inventory row for the lifetime of this transaction. Any
       * concurrent reservation trying to lock the same product/warehouse stock
       * row must wait until this transaction commits or rolls back.
       *
       * Transaction boundary:
       * The lock acquisition, available-stock check, Inventory.reservedStock
       * update, and Reservation insert all happen inside this single
       * $transaction callback. That means the stock read and write are one
       * indivisible unit from the point of view of competing requests.
       *
       * Why race conditions cannot occur:
       * Request A and Request B cannot both read the same pre-update stock for
       * the same row. One locks first. The second waits, then re-reads after the
       * first commits. If A reserved the final unit, B sees availableStock = 0
       * and fails with InsufficientStockError, producing HTTP 409.
       */
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          productId: string;
          warehouseId: string;
          totalStock: number;
          reservedStock: number;
        }>
      >(Prisma.sql`
        SELECT id, "productId", "warehouseId", "totalStock", "reservedStock"
        FROM "Inventory"
        WHERE "productId" = ${input.productId}
          AND "warehouseId" = ${input.warehouseId}
        FOR UPDATE
      `);

      const inventory = lockedRows[0];

      if (!inventory) {
        throw new InsufficientStockError(0, input.quantity);
      }

      const availableStock = getAvailableStock(
        inventory.totalStock,
        inventory.reservedStock,
      );

      if (availableStock < input.quantity) {
        throw new InsufficientStockError(availableStock, input.quantity);
      }

      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          reservedStock: {
            increment: input.quantity,
          },
        },
      });

      return tx.reservation.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          inventoryId: inventory.id,
          quantity: input.quantity,
          status: ReservationStatus.PENDING,
          expiresAt:
            input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : {}),
        },
        include: reservationInclude,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

export type ReservationResult = Awaited<ReturnType<typeof createReservation>>;

async function lockReservationAndInventory(
  tx: Prisma.TransactionClient,
  reservationId: string,
) {
  /*
   * We lock the Reservation row first, then its Inventory row. Every state
   * transition uses this same order, so concurrent confirm/release requests do
   * not deadlock by taking locks in opposite directions.
   */
  const reservationRows = await tx.$queryRaw<LockedReservationRow[]>(Prisma.sql`
    SELECT id, "inventoryId", quantity, status, "expiresAt"
    FROM "Reservation"
    WHERE id = ${reservationId}
    FOR UPDATE
  `);

  const reservation = reservationRows[0];

  if (!reservation) {
    throw new ReservationNotFoundError(reservationId);
  }

  const inventoryRows = await tx.$queryRaw<LockedInventoryRow[]>(Prisma.sql`
    SELECT id, "totalStock", "reservedStock"
    FROM "Inventory"
    WHERE id = ${reservation.inventoryId}
    FOR UPDATE
  `);

  const inventory = inventoryRows[0];

  if (!inventory) {
    throw new ReservationNotFoundError(reservationId);
  }

  return { reservation, inventory };
}

async function fetchReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
) {
  return tx.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: reservationInclude,
  });
}

function isExpired(expiresAt: Date | null) {
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

async function expirePendingReservation(
  tx: Prisma.TransactionClient,
  reservation: LockedReservationRow,
) {
  /*
   * Expiration cleanup is still transactional. The same locked reservation row
   * guards this block, so only one request can subtract the held quantity from
   * reservedStock and mark the reservation EXPIRED.
   */
  if (reservation.status === ReservationStatus.PENDING) {
    await tx.inventory.update({
      where: { id: reservation.inventoryId },
      data: {
        reservedStock: {
          decrement: reservation.quantity,
        },
      },
    });

    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.EXPIRED },
    });
  }
}

export async function confirmReservation(reservationId: string) {
  return prisma.$transaction(
    async (tx) => {
      const { reservation } = await lockReservationAndInventory(
        tx,
        reservationId,
      );

      if (isExpired(reservation.expiresAt)) {
        await expirePendingReservation(tx, reservation);
        throw new ReservationExpiredError(reservationId);
      }

      if (reservation.status === ReservationStatus.CONFIRMED) {
        return fetchReservation(tx, reservationId);
      }

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new ReservationStateError(
          reservationId,
          reservation.status,
          "confirm",
        );
      }

      /*
       * Confirm permanently consumes the held units. Because both Reservation
       * and Inventory are locked in this transaction, no release request can
       * simultaneously decrement reservedStock while this update decrements
       * both reservedStock and totalStock.
       */
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: {
          totalStock: {
            decrement: reservation.quantity,
          },
          reservedStock: {
            decrement: reservation.quantity,
          },
        },
      });

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CONFIRMED },
      });

      return fetchReservation(tx, reservationId);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

export async function releaseReservation(reservationId: string) {
  return prisma.$transaction(
    async (tx) => {
      const { reservation } = await lockReservationAndInventory(
        tx,
        reservationId,
      );

      if (isExpired(reservation.expiresAt)) {
        await expirePendingReservation(tx, reservation);
        throw new ReservationExpiredError(reservationId);
      }

      if (
        reservation.status === ReservationStatus.CANCELLED ||
        reservation.status === ReservationStatus.EXPIRED
      ) {
        return fetchReservation(tx, reservationId);
      }

      if (reservation.status === ReservationStatus.CONFIRMED) {
        throw new ReservationStateError(
          reservationId,
          reservation.status,
          "release",
        );
      }

      /*
       * Releasing twice cannot corrupt inventory: only PENDING reservations
       * reach this decrement. Once the status becomes CANCELLED, later release
       * calls return the existing reservation without touching reservedStock.
       */
      await tx.inventory.update({
        where: { id: reservation.inventoryId },
        data: {
          reservedStock: {
            decrement: reservation.quantity,
          },
        },
      });

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: ReservationStatus.CANCELLED },
      });

      return fetchReservation(tx, reservationId);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

export function serializeReservation(reservation: ReservationResult) {
  const availableStock = getAvailableStock(
    reservation.inventory.totalStock,
    reservation.inventory.reservedStock,
  );

  return {
    id: reservation.id,
    status: reservation.status,
    quantity: reservation.quantity,
    idempotencyKey: reservation.idempotencyKey,
    expiresAt: reservation.expiresAt?.toISOString() ?? null,
    product: {
      id: reservation.product.id,
      sku: reservation.product.sku,
      name: reservation.product.name,
    },
    warehouse: {
      id: reservation.warehouse.id,
      code: reservation.warehouse.code,
      name: reservation.warehouse.name,
    },
    inventory: {
      id: reservation.inventory.id,
      totalStock: reservation.inventory.totalStock,
      reservedStock: reservation.inventory.reservedStock,
      availableStock,
    },
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  };
}
