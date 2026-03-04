import { Redis } from "@upstash/redis";
import { env } from "./env.js";

const redis = new Redis({
  url: env.upstash_redis_rest_url,
  token: env.upstash_redis_rest_token,
});

export default redis;
