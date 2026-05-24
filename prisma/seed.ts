import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    sku: "SKU-ERG-CHAIR",
    name: "ErgoMesh Office Chair",
    description: "Adjustable ergonomic chair with breathable mesh back.",
    priceInCents: 24900,
  },
  {
    sku: "SKU-USB-C-HUB",
    name: "USB-C Docking Hub",
    description: "Seven-port aluminum hub for modern laptops.",
    priceInCents: 7900,
  },
  {
    sku: "SKU-MECH-KBD",
    name: "Tactile Mechanical Keyboard",
    description: "Compact hot-swappable keyboard with tactile switches.",
    priceInCents: 12900,
  },
  {
    sku: "SKU-4K-MON",
    name: "27-inch 4K Monitor",
    description: "Color-accurate UHD display for design and operations.",
    priceInCents: 32900,
  },
  {
    sku: "SKU-STAND-DESK",
    name: "Standing Desk Frame",
    description: "Dual-motor adjustable desk frame with memory presets.",
    priceInCents: 39900,
  },
];

const warehouses = [
  { code: "EAST-01", name: "East Coast Fulfillment", city: "Newark" },
  { code: "CENT-01", name: "Central Distribution", city: "Dallas" },
  { code: "WEST-01", name: "West Coast Fulfillment", city: "Reno" },
];

const stockMatrix = [
  [120, 75, 42],
  [300, 180, 220],
  [90, 60, 35],
  [48, 24, 18],
  [32, 40, 16],
];

async function main() {
  const createdProducts = await Promise.all(
    products.map((product) =>
      prisma.product.upsert({
        where: { sku: product.sku },
        update: product,
        create: product,
      }),
    ),
  );

  const createdWarehouses = await Promise.all(
    warehouses.map((warehouse) =>
      prisma.warehouse.upsert({
        where: { code: warehouse.code },
        update: warehouse,
        create: warehouse,
      }),
    ),
  );

  for (const [productIndex, product] of createdProducts.entries()) {
    for (const [warehouseIndex, warehouse] of createdWarehouses.entries()) {
      const totalStock = stockMatrix[productIndex]?.[warehouseIndex] ?? 0;
      const reservedStock = Math.floor(totalStock * 0.15);

      await prisma.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: warehouse.id,
          },
        },
        update: {
          totalStock,
          reservedStock,
        },
        create: {
          productId: product.id,
          warehouseId: warehouse.id,
          totalStock,
          reservedStock,
        },
      });
    }
  }

  const keyboard = createdProducts.find(
    (product) => product.sku === "SKU-MECH-KBD",
  );
  const westWarehouse = createdWarehouses.find(
    (warehouse) => warehouse.code === "WEST-01",
  );

  if (keyboard && westWarehouse) {
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: {
        productId_warehouseId: {
          productId: keyboard.id,
          warehouseId: westWarehouse.id,
        },
      },
    });

    await prisma.reservation.upsert({
      where: { idempotencyKey: "demo-reservation-key-001" },
      update: {
        quantity: 3,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
      create: {
        productId: keyboard.id,
        warehouseId: westWarehouse.id,
        inventoryId: inventory.id,
        idempotencyKey: "demo-reservation-key-001",
        quantity: 3,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  }

  await prisma.idempotencyKey.upsert({
    where: { key: "demo-reservation-key-001" },
    update: {
      requestHash: "sha256:demo-request",
      responseStatus: 201,
      responseBody: { reservation: "demo-reservation-key-001" },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    create: {
      key: "demo-reservation-key-001",
      requestHash: "sha256:demo-request",
      responseStatus: 201,
      responseBody: { reservation: "demo-reservation-key-001" },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
