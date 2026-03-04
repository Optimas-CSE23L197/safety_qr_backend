import Redis from "ioredis";
import { env } from "./env";

const redis = new Redis(env.redis_url ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: false,
});

redis.on("connect", () => console.log("[Redis] Connected"));
redis.on("ready", () => console.log("[Redis] Ready"));
redis.on("error", (err) => console.error("[Redis] Error:", err.message));
redis.on("close", () => console.warn("[Redis] Connection closed"));

export default redis;
