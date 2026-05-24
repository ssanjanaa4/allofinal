import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let redis: Redis | undefined;

export function getRedis() {
  if (redis) {
    return redis;
  }

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Upstash Redis environment variables are not configured.");
  }

  redis = new Redis({ url, token });

  return redis;
}
