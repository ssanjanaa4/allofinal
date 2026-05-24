import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { getAvailableStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseSearchParams, productsQuerySchema } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

type ProductWithInventory = Prisma.ProductGetPayload<{
  include: {
    inventory: {
      include: {
        warehouse: true;
      };
    };
  };
}>;

function serializeProduct(product: ProductWithInventory) {
  const warehouses = product.inventory.map((inventory) => ({
    warehouseId: inventory.warehouse.id,
    warehouseCode: inventory.warehouse.code,
    warehouseName: inventory.warehouse.name,
    city: inventory.warehouse.city,
    country: inventory.warehouse.country,
    totalStock: inventory.totalStock,
    reservedStock: inventory.reservedStock,
    availableStock: getAvailableStock(
      inventory.totalStock,
      inventory.reservedStock,
    ),
  }));

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    priceInCents: product.priceInCents,
    isActive: product.isActive,
    totalStock: warehouses.reduce((sum, item) => sum + item.totalStock, 0),
    reservedStock: warehouses.reduce((sum, item) => sum + item.reservedStock, 0),
    availableStock: warehouses.reduce(
      (sum, item) => sum + item.availableStock,
      0,
    ),
    warehouses,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const query = parseSearchParams(request, productsQuerySchema);

    const where: Prisma.ProductWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.warehouseId
        ? { inventory: { some: { warehouseId: query.warehouseId } } }
        : {}),
    };

    const products = await prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      include: {
        inventory: {
          orderBy: { warehouse: { code: "asc" } },
          include: { warehouse: true },
        },
      },
    });

    const data = products.map(serializeProduct);

    return ok(data, {
      count: data.length,
      totalAvailableStock: data.reduce(
        (sum, product) => sum + product.availableStock,
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
