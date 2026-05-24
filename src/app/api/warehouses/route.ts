import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { ok, serverError, validationError } from "@/lib/api/responses";
import {
  parseSearchParams,
  warehousesQuerySchema,
} from "@/lib/api/validation";
import { getAvailableStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type WarehouseWithInventory = Prisma.WarehouseGetPayload<{
  include: {
    inventory: {
      include: {
        product: true;
      };
    };
  };
}>;

function serializeWarehouse(warehouse: WarehouseWithInventory) {
  const products = warehouse.inventory.map((inventory) => ({
    productId: inventory.product.id,
    sku: inventory.product.sku,
    name: inventory.product.name,
    totalStock: inventory.totalStock,
    reservedStock: inventory.reservedStock,
    availableStock: getAvailableStock(
      inventory.totalStock,
      inventory.reservedStock,
    ),
  }));

  return {
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name,
    city: warehouse.city,
    country: warehouse.country,
    isActive: warehouse.isActive,
    totalStock: products.reduce((sum, item) => sum + item.totalStock, 0),
    reservedStock: products.reduce((sum, item) => sum + item.reservedStock, 0),
    availableStock: products.reduce((sum, item) => sum + item.availableStock, 0),
    products,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const query = parseSearchParams(request, warehousesQuerySchema);

    const where: Prisma.WarehouseWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.productId
        ? { inventory: { some: { productId: query.productId } } }
        : {}),
    };

    const warehouses = await prisma.warehouse.findMany({
      where,
      orderBy: [{ code: "asc" }],
      include: {
        inventory: {
          orderBy: { product: { sku: "asc" } },
          include: { product: true },
        },
      },
    });

    const data = warehouses.map(serializeWarehouse);

    return ok(data, {
      count: data.length,
      totalAvailableStock: data.reduce(
        (sum, warehouse) => sum + warehouse.availableStock,
        0,
      ),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return serverError(error);
  }
}
