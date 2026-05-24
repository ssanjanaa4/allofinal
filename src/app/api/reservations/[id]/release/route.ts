import { z, ZodError } from "zod";

import {
  conflict,
  gone,
  notFound,
  ok,
  serverError,
  validationError,
} from "@/lib/api/responses";
import {
  releaseReservation,
  ReservationExpiredError,
  ReservationNotFoundError,
  ReservationStateError,
  serializeReservation,
} from "@/lib/reservations";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().cuid(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const reservation = await releaseReservation(id);

    return ok(serializeReservation(reservation));
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    if (error instanceof ReservationExpiredError) {
      return gone("Reservation has expired and was released.", {
        reservationId: error.reservationId,
      });
    }

    if (error instanceof ReservationNotFoundError) {
      return notFound("Reservation not found.", {
        reservationId: error.reservationId,
      });
    }

    if (error instanceof ReservationStateError) {
      return conflict("Reservation cannot be released from its current state.", {
        reservationId: error.reservationId,
        status: error.currentStatus,
      });
    }

    return serverError(error);
  }
}
