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

export type CreateReservationInput = {
  productId: string;
  warehouseId: string;
  quantity: number;
  idempotencyKey?: string | undefined;
  expiresAt?: Date | undefined;
};

export async function createReservation(input: CreateReservationInput) {
  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const existingReservation = await tx.reservation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: {
            product: true,
            warehouse: true,
            inventory: true,
          },
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
        include: {
          product: true,
          warehouse: true,
          inventory: true,
        },
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
