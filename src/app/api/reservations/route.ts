import { ZodError } from "zod";

import { conflict, ok, serverError, validationError } from "@/lib/api/responses";
import {
  createReservationSchema,
  parseJsonBody,
} from "@/lib/api/validation";
import {
  createReservation,
  InsufficientStockError,
  serializeReservation,
} from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, createReservationSchema);
    const reservation = await createReservation(body);

    return ok(serializeReservation(reservation), {
      availableStockAfterReservation:
        reservation.inventory.totalStock - reservation.inventory.reservedStock,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    if (error instanceof InsufficientStockError) {
      return conflict("Insufficient stock for reservation.", {
        availableStock: error.availableStock,
        requestedQuantity: error.requestedQuantity,
      });
    }

    return serverError(error);
  }
}
