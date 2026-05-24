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

export function parseSearchParams<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): z.infer<TSchema> {
  const params = Object.fromEntries(new URL(request.url).searchParams);

  return schema.parse(params);
}
