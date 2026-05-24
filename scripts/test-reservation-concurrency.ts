import { PrismaClient } from "@prisma/client";

import { createReservation } from "../src/lib/reservations";

const prisma = new PrismaClient();

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

  await prisma.inventory.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: 1,
      reservedStock: 0,
    },
  });

  const attempts = await Promise.allSettled([
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

  const succeeded = attempts.filter((attempt) => attempt.status === "fulfilled");
  const failed = attempts.filter((attempt) => attempt.status === "rejected");

  console.log({
    succeeded: succeeded.length,
    failed: failed.length,
    invariantHeld: succeeded.length === 1 && failed.length === 1,
  });

  if (succeeded.length !== 1 || failed.length !== 1) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
