import { z } from "zod";

export const booleanQuerySchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export const productsQuerySchema = z.object({
  includeInactive: booleanQuerySchema,
  search: z.string().trim().min(1).max(100).optional(),
  warehouseId: z.string().cuid().optional(),
});

export const warehousesQuerySchema = z.object({
  includeInactive: booleanQuerySchema,
  productId: z.string().cuid().optional(),
});

export const createReservationSchema = z.object({
  productId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  quantity: z.number().int().positive().max(10000),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
  expiresAt: z.coerce.date().optional(),
});

export function parseSearchParams<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): z.infer<TSchema> {
  const params = Object.fromEntries(new URL(request.url).searchParams);

  return schema.parse(params);
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const body = (await request.json()) as unknown;

  return schema.parse(body);
}
