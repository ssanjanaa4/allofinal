import { NextResponse } from "next/server";

import { badRequest, conflict, serverError } from "@/lib/api/responses";
import { getRedis } from "@/lib/redis";

const RESPONSE_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 30;

type CachedResponse = {
  status: number;
  body: unknown;
};

function getRequestFingerprint(request: Request) {
  const url = new URL(request.url);

  return `${request.method}:${url.pathname}`;
}

function getKeys(request: Request, idempotencyKey: string) {
  const fingerprint = getRequestFingerprint(request);
  const baseKey = `idempotency:${fingerprint}:${idempotencyKey}`;

  return {
    responseKey: `${baseKey}:response`,
    lockKey: `${baseKey}:lock`,
  };
}

async function responseToCache(response: Response): Promise<CachedResponse> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  return {
    status: response.status,
    body,
  };
}

function cachedResponseToNextResponse(cached: CachedResponse) {
  return NextResponse.json(cached.body, {
    status: cached.status,
    headers: {
      "Idempotency-Status": "cached",
    },
  });
}

export async function withIdempotency(
  request: Request,
  handler: () => Promise<Response>,
) {
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();

  if (!idempotencyKey) {
    return badRequest("Missing Idempotency-Key header.");
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return badRequest("Idempotency-Key must be between 8 and 128 characters.");
  }

  const { responseKey, lockKey } = getKeys(request, idempotencyKey);
  const redis = getRedis();
  const cached = await redis.get<CachedResponse>(responseKey);

  if (cached) {
    return cachedResponseToNextResponse(cached);
  }

  const lock = await redis.set(lockKey, "locked", {
    ex: LOCK_TTL_SECONDS,
    nx: true,
  });

  if (!lock) {
    return conflict("A request with this Idempotency-Key is already running.");
  }

  try {
    const response = await handler();
    const cacheableResponse = await responseToCache(response.clone());

    if (response.status < 500) {
      await redis.set(responseKey, cacheableResponse, {
        ex: RESPONSE_TTL_SECONDS,
      });
    }

    return NextResponse.json(cacheableResponse.body, {
      status: cacheableResponse.status,
      headers: {
        "Idempotency-Status": "created",
      },
    });
  } catch (error) {
    return serverError(error);
  } finally {
    await redis.del(lockKey);
  }
}
