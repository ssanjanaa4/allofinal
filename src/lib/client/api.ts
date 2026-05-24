import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  ProductSummary,
  ReservationSummary,
} from "@/types/inventory";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function request<TData>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<TData> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = await readJson<ApiErrorEnvelope>(response);

    throw new ApiClientError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.details,
    );
  }

  const body = await readJson<ApiEnvelope<TData>>(response);

  return body.data;
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function getProducts() {
  return request<ProductSummary[]>("/api/products");
}

export async function createReservation(input: {
  productId: string;
  warehouseId: string;
  quantity: number;
}) {
  return request<ReservationSummary>("/api/reservations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": newIdempotencyKey("reserve"),
    },
    body: JSON.stringify(input),
  });
}

export async function confirmReservation(reservationId: string) {
  return request<ReservationSummary>(
    `/api/reservations/${reservationId}/confirm`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": newIdempotencyKey("confirm"),
      },
    },
  );
}

export async function releaseReservation(reservationId: string) {
  return request<ReservationSummary>(
    `/api/reservations/${reservationId}/release`,
    {
      method: "POST",
    },
  );
}
