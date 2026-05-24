import { NextResponse } from "next/server";
import { ZodError } from "zod";

type ApiErrorCode =
  | "BAD_REQUEST"
  | "CONFLICT"
  | "GONE"
  | "INTERNAL_SERVER_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

type ApiSuccess<TData, TMeta = Record<string, never>> = {
  data: TData;
  meta?: TMeta;
};

type ApiFailure = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function ok<TData, TMeta = Record<string, never>>(
  data: TData,
  meta?: TMeta,
) {
  const body: ApiSuccess<TData, TMeta> = meta ? { data, meta } : { data };

  return NextResponse.json(body);
}

export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  const body: ApiFailure = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  return NextResponse.json(body, { status });
}

export function badRequest(message: string, details?: unknown) {
  return fail("BAD_REQUEST", message, 400, details);
}

export function validationError(error: ZodError) {
  return fail(
    "VALIDATION_ERROR",
    "Invalid request parameters.",
    400,
    error.flatten(),
  );
}

export function conflict(message: string, details?: unknown) {
  return fail("CONFLICT", message, 409, details);
}

export function gone(message: string, details?: unknown) {
  return fail("GONE", message, 410, details);
}

export function notFound(message: string, details?: unknown) {
  return fail("NOT_FOUND", message, 404, details);
}

export function unauthorized(message = "Unauthorized.") {
  return fail("UNAUTHORIZED", message, 401);
}

export function serverError(error: unknown) {
  console.error(error);

  return fail(
    "INTERNAL_SERVER_ERROR",
    "An unexpected error occurred while processing the request.",
    500,
  );
}
