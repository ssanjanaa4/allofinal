import { PrismaClient } from "@prisma/client";

import {
  confirmReservation,
  createReservation,
  releaseReservation,
  ReservationResult,
  ReservationStateError,
} from "../src/lib/reservations";

const prisma = new PrismaClient();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const product = await prisma.product.create({
    data: {
      sku: `CONCURRENCY-${Date.now()}`,
      name: "Concurrency Test Product",
      priceInCents: 1000,
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      code: `CONC-${Date.now()}`,
      name: "Concurrency Test Warehouse",
      city: "Test City",
    },
  });

  const inventory = await prisma.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: 1,
      reservedStock: 0,
    },
  });

  /*
   * Concurrent reservation attempts should not oversell the single unit.
   * One request must succeed and the other must fail with insufficient stock.
   */
  const attempts = await Promise.allSettled<ReservationResult>([
    createReservation({
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: 1,
      idempotencyKey: `concurrency-a-${Date.now()}`,
    }),
    createReservation({
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: 1,
      idempotencyKey: `concurrency-b-${Date.now()}`,
    }),
  ]);

  const succeeded = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<ReservationResult> =>
      attempt.status === "fulfilled",
  );
  const failed = attempts.filter(
    (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
  );

  console.log({
    succeeded: succeeded.length,
    failed: failed.length,
    invariantHeld: succeeded.length === 1 && failed.length === 1,
  });

  assert(
    succeeded.length === 1 && failed.length === 1,
    "Expected exactly one reservation to succeed and one to fail.",
  );

  const reservation = succeeded[0]?.value;
  assert(reservation !== undefined, "Expected one successful reservation.");

  await confirmReservation(reservation.id);
  const confirmedInventory = await prisma.inventory.findUniqueOrThrow({
    where: { id: inventory.id },
  });

  assert(
    confirmedInventory.totalStock === 0 && confirmedInventory.reservedStock === 0,
    "Inventory counts should settle to zero after confirmation.",
  );

  /*
   * A release request after a confirmed reservation must be rejected and
   * must not corrupt inventory counters.
   */
  let releaseError: unknown = null;

  try {
    await releaseReservation(reservation.id);
  } catch (error) {
    releaseError = error;
  }

  assert(
    releaseError instanceof ReservationStateError,
    "Expected release after confirm to throw a ReservationStateError.",
  );

  const finalInventory = await prisma.inventory.findUniqueOrThrow({
    where: { id: inventory.id },
  });

  assert(
    finalInventory.totalStock === confirmedInventory.totalStock &&
      finalInventory.reservedStock === confirmedInventory.reservedStock,
    "Inventory should remain unchanged after invalid release.",
  );

  console.log("Concurrency test passed: no oversell, confirm/release invariants upheld.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
