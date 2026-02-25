import slowDown from "express-slow-down";
import { RedisStore } from "rate-limit-redis";
import redis from "../config/redis.js";

export const authSlowDown = slowDown({
  windowMs: 60 * 1000, // 1 minute window
  delayAfter: 3, // start slowing after 3 requests
  delayMs: (hits) => (hits - 3) * 500, // 500ms per extra hit
  maxDelayMs: 5000, // never delay more than 5 seconds
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: "sd:auth:",
  }),
});
