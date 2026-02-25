import crypto from "crypto";
import { RedisStore } from "rate-limit-redis";
import { ApiError } from "../utils/ApiError.js";
import redis from "../config/redis.js";

// =============================================================================
// Store factory
// =============================================================================
export const makeStore = (prefix) =>
  new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: `rl:${prefix}:`,
  });

// =============================================================================
// Handler factory
// =============================================================================
export const createHandler =
  (message = "Too many requests, please try again later.") =>
  (req, res, next) => {
    next(new ApiError(429, message));
  };

/**
 * Normalize phone number to a consistent format for lookup.
 * Strips spaces, dashes, and leading country code.
 * e.g. "+91 98765 43210" → "9876543210"
 */
export const normalizePhoneNumber = (phone) => {
  return phone.replace(/\D/g, "").replace(/^91/, "");
};

/**
 * Create phone blind index for DB lookup.
 * Same HMAC used when creating ParentUser records.
 */
export const phoneToIndex = (normalizedPhone) => {
  return crypto
    .createHmac("sha256", process.env.PHONE_INDEX_SECRET)
    .update(normalizedPhone)
    .digest("hex");
};

/**
 * Calculate refresh token expiry date.
 */
export const refreshTokenExpiry = () => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
};

export const getContext = (req) => ({
  ip: req.ip,
  deviceInfo: req.headers["user-agent"] ?? null,
});
