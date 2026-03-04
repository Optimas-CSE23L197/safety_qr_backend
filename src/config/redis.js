import { Redis } from "@upstash/redis";
import { env } from "./env.js";

const redis = new Redis({
  url: env.upstash_url,
  token: env.upstash_token,
});

export default redis;
