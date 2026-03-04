import crypto from "crypto";
import redis from "../config/redis.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 3; // max wrong attempts before OTP is invalidated
const OTP_RESEND_COOLDOWN = 60; // seconds before resend is allowed

const otpKey = (phone) => `otp:${phone}`;
const attemptsKey = (phone) => `otp:attempts:${phone}`;
const cooldownKey = (phone) => `otp:cooldown:${phone}`;

// =============================================================================
// GENERATE
// =============================================================================

/**
 * Generate a cryptographically secure 6-digit OTP.
 * Uses crypto.randomInt for unbiased uniform distribution.
 */
export const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Hash OTP before storing in Redis.
 * Never store raw OTP — hash it same as passwords.
 */
export const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};

// =============================================================================
// SEND OTP
// =============================================================================

/**
 * Generate and store OTP for a phone number.
 * Enforces resend cooldown to prevent SMS spam.
 * Returns the raw OTP — caller passes it to SMS provider.
 *
 * @param {string} phone - normalized phone number
 * @returns {{ otp: string, expiresInSeconds: number }}
 */
export const sendOtp = async (phone) => {
  // Check resend cooldown
  const cooldown = await redis.get(cooldownKey(phone));
  if (cooldown) {
    const ttl = await redis.ttl(cooldownKey(phone));
    throw new Error(`COOLDOWN:${ttl}`); // caller handles this error type
  }

  const otp = generateOtp();
  const hashed = hashOtp(otp);

  // Store hashed OTP with TTL
  await redis.setex(otpKey(phone), OTP_TTL_SECONDS, hashed);

  // Reset attempt counter
  await redis.del(attemptsKey(phone));

  // Set resend cooldown
  await redis.setex(cooldownKey(phone), OTP_RESEND_COOLDOWN, "1");

  // =============================================================================
  // SMS PROVIDER — swap this block when ready
  // =============================================================================
  //TODO DEV MODE — log OTP to console, never in production
  console.log(`\n[OTP SERVICE - DEV ONLY] Phone: ${phone} | OTP: ${otp}\n`);
  // =============================================================================

  return { expiresInSeconds: OTP_TTL_SECONDS };
};

// =============================================================================
// VERIFY OTP
// =============================================================================

/**
 * Verify OTP for a phone number.
 * Tracks failed attempts — invalidates OTP after max attempts.
 *
 * @param {string} phone
 * @param {string} otp - raw OTP from user input
 * @returns {boolean} true if valid
 */
export const verifyOtp = async (phone, otp) => {
  const storedHash = await redis.get(otpKey(phone));

  if (!storedHash) {
    throw new Error("OTP_EXPIRED"); // OTP never sent or already expired
  }

  // Check attempt count
  const attempts = parseInt((await redis.get(attemptsKey(phone))) ?? "0", 10);

  if (attempts >= OTP_MAX_ATTEMPTS) {
    // Invalidate OTP on max attempts
    await redis.del(otpKey(phone));
    await redis.del(attemptsKey(phone));
    throw new Error("OTP_MAX_ATTEMPTS");
  }

  const inputHash = hashOtp(otp);
  const isValid = inputHash === storedHash;

  if (!isValid) {
    // Increment attempts
    await redis.incr(attemptsKey(phone));
    await redis.expire(attemptsKey(phone), OTP_TTL_SECONDS);
    throw new Error("OTP_INVALID");
  }

  // Valid — clean up Redis
  await redis.del(otpKey(phone));
  await redis.del(attemptsKey(phone));
  await redis.del(cooldownKey(phone));

  return true;
};
