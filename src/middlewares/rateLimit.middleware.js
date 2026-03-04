import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RATE_LIMIT } from "../config/constants.js";
import redis from "../config/redis.js";
import { createHandler, makeStore } from "../utils/helper.js";

// =============================================================================
// 🌍 Global limiter
// =============================================================================

export const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  store: makeStore("global"),
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: createHandler(),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.endsWith("/health"),
});

// =============================================================================
// 🔐 Auth limiter
// =============================================================================

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  store: makeStore("auth"),
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: createHandler("Too many login attempts. Please wait a minute."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// =============================================================================
// 🟢 Scan limiter
// =============================================================================

export const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  store: makeStore("scan"),
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: createHandler("Too many scan requests. Please try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// 🟡 Burst limiter
// =============================================================================

export const scanBurstLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  store: makeStore("scan_burst"),
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: createHandler("Scanning too fast. Please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// 🔴 Global scan ceiling
// =============================================================================

export const scanGlobalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5000,
  store: makeStore("scan_global"),
  keyGenerator: () => "global",
  handler: (req, res) => {
    res.status(503).json({
      success: false,
      message: "System is busy. Please try again shortly.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// 🔒 Per-token limiter
// =============================================================================

export const perTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  store: makeStore("scan_token"),
  keyGenerator: (req) => {
    if (req.body?.token) return `token:${req.body.token}`;
    return `ip:${ipKeyGenerator(req)}`;
  },
  handler: createHandler(
    "This QR code has been scanned too many times. Please try again shortly.",
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// Sliding window script
// =============================================================================

const SLIDING_WINDOW_SCRIPT = `
  local key        = KEYS[1]
  local now        = tonumber(ARGV[1])
  local window_ms  = tonumber(ARGV[2])
  local max_reqs   = tonumber(ARGV[3])
  local window_start = now - window_ms
  redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
  local count = redis.call('ZCARD', key)
  if count >= max_reqs then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = math.ceil((tonumber(oldest[2]) + window_ms - now) / 1000)
    return {0, count, retry_after}
  end
  redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
  redis.call('PEXPIRE', key, window_ms + 5000)
  return {1, count + 1, 0}
`;

export const RATE_LIMIT_TIERS = {
  SCAN_PUBLIC: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: "rl:scan:pub",
  },
  SCAN_TOKEN: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    keyPrefix: "rl:scan:tok",
  },
  SCAN_DASHBOARD: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: "rl:scan:dash",
  },
};

export const checkRateLimit = async (key, tier) => {
  const redisKey = `${tier.keyPrefix}:${key}`;
  const now = Date.now();

  const [allowed, count, retryAfter] = await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    redisKey,
    String(now),
    String(tier.windowMs),
    String(tier.maxRequests),
  );

  return {
    allowed: allowed === 1,
    count: Number(count),
    retryAfter: Number(retryAfter),
  };
};
