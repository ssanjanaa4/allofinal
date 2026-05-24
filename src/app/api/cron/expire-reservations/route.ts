import { z, ZodError } from "zod";

import {
  ok,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api/responses";
import { cleanupExpiredReservations } from "@/lib/reservations";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  batchSize: z.coerce.number().int().positive().max(1000).default(100),
});

function isAuthorized(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.get("authorization") === `Bearer ${expectedSecret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return unauthorized();
    }

    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    const result = await cleanupExpiredReservations(query.batchSize);

    return ok(result, {
      strategy: "vercel-cron-with-skip-locked-batches",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return serverError(error);
  }
}
