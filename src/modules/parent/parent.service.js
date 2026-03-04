import crypto from "crypto";
import * as parentRepo from "./parent.repository.js";
import { redis } from "../lib/redis.js";
import { signJwt } from "../utils/jwt.js";
import { sendOtp } from "../utils/sms.js";
import { AppError } from "../utils/errors.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;
const NONCE_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp() {
  // Cryptographically random 6-digit OTP
  return String(crypto.randomInt(100000, 999999));
}

function generateNonce() {
  return crypto.randomBytes(32).toString("hex"); // 64 char hex string
}

function maskPhone(phone) {
  // +919876543210 → +91****3210
  if (phone.length < 5) return "****";
  return phone.slice(0, -6).replace(/\d/g, "*") + phone.slice(-4);
}

function otpRedisKey(phone) {
  return `otp:${phone}`;
}

// ─── Init Registration ────────────────────────────────────────────────────────

/**
 * 1. Validate card → token (must be UNASSIGNED)
 * 2. Find or create ParentUser by phone
 * 3. Generate OTP → Redis (5 min TTL)
 * 4. Create RegistrationNonce → Postgres (15 min TTL)
 * 5. Fire-and-forget SMS
 * 6. Return { nonce, masked_phone }
 */
export async function initRegistration({ card_number, phone }) {
  // 1. Card lookup
  const card = await parentRepo.findCardByNumber(card_number);
  if (!card)
    throw new AppError("Card not found. Check the number and try again.", 404);
  if (!card.token_id)
    throw new AppError(
      "This card has no token assigned. Contact your school.",
      400,
    );

  // 2. Token must be UNASSIGNED
  const token = await parentRepo.findTokenById(card.token_id);
  if (!token) throw new AppError("Token not found.", 404);
  if (token.status !== "UNASSIGNED") {
    throw new AppError("This card is already registered.", 409);
  }

  // 3. Find or create parent by phone
  // Phone index is normalized (no spaces, lowercase) for lookup
  const phoneIndex = phone.replace(/\s+/g, "").toLowerCase();
  await parentRepo.upsertParentByPhone({ phone, phone_index: phoneIndex });

  // 4. OTP → Redis
  const otp = generateOtp();
  console.log("otp -> ", otp);
  const otpKey = otpRedisKey(phoneIndex);
  await redis.set(
    otpKey,
    JSON.stringify({ code: otp, attempts: 0 }),
    "EX",
    OTP_TTL_SECONDS,
  );

  // 5. Nonce → Postgres
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);
  await parentRepo.createNonce({
    nonce,
    token_id: token.id,
    expires_at: expiresAt,
  });

  // 6. SMS — fire and forget, don't await, don't fail the request if SMS fails
  sendOtp(phone, otp).catch((err) => {
    console.error(
      `[SMS] Failed to send OTP to ${maskPhone(phone)}:`,
      err.message,
    );
  });

  return {
    nonce,
    masked_phone: maskPhone(phone),
  };
}

// ─── Verify Registration ──────────────────────────────────────────────────────

/**
 * 1. Validate nonce (unused, not expired)
 * 2. Validate OTP from Redis (max 3 attempts, single-use)
 * 3. Single DB transaction:
 *      - nonce → used = true
 *      - Student shell created (school_id from token)
 *      - ParentStudent link created
 *      - Token UNASSIGNED → ISSUED, assigned_at = now
 *      - Session created
 * 4. Return { jwt, student_id, isProfileComplete: false }
 */
export async function verifyRegistration({ nonce, otp, ip, device_info }) {
  // 1. Validate nonce
  const nonceRecord = await parentRepo.findNonce(nonce);
  if (!nonceRecord)
    throw new AppError("Invalid or expired registration link.", 400);
  if (nonceRecord.used)
    throw new AppError("This registration link has already been used.", 400);
  if (new Date(nonceRecord.expires_at) < new Date()) {
    throw new AppError("Registration link expired. Please start again.", 400);
  }

  // 2. Get token → get school_id + find parent by token
  const token = await parentRepo.findTokenById(nonceRecord.token_id);
  if (!token) throw new AppError("Token not found.", 404);
  if (token.status !== "UNASSIGNED") {
    throw new AppError("This card has already been registered.", 409);
  }

  // 3. Validate OTP
  const phoneIndex = token.parent_phone_index; // attached by findTokenById join
  if (!phoneIndex)
    throw new AppError("Parent phone not found for this token.", 400);

  const otpKey = otpRedisKey(phoneIndex);
  const otpRaw = await redis.get(otpKey);
  if (!otpRaw)
    throw new AppError("OTP expired. Please request a new one.", 400);

  const otpData = JSON.parse(otpRaw);

  if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey);
    throw new AppError(
      "Too many incorrect attempts. Please request a new OTP.",
      429,
    );
  }

  if (otpData.code !== otp) {
    // Increment attempts
    await redis.set(
      otpKey,
      JSON.stringify({ ...otpData, attempts: otpData.attempts + 1 }),
      "KEEPTTL", // keep original TTL
    );
    const remaining = OTP_MAX_ATTEMPTS - (otpData.attempts + 1);
    throw new AppError(
      `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      400,
    );
  }

  // OTP matched — delete immediately (single use)
  await redis.del(otpKey);

  // 4. Single transaction: create everything
  const { student, session } = await parentRepo.completeRegistration({
    nonce,
    token_id: token.id,
    school_id: token.school_id,
    phone_index: phoneIndex,
    ip,
    device_info,
    session_expires_at: new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ),
  });

  // 5. Sign JWT
  const jwt = signJwt({
    sub: session.parent_user_id,
    session_id: session.id,
    type: "parent",
  });

  return {
    jwt,
    student_id: student.id,
    isProfileComplete: false,
  };
}

// ─── Update Student Profile ───────────────────────────────────────────────────

/**
 * Called from UpdatesScreen PATCH /student/:studentId
 * - Verifies parent owns this student
 * - Upserts Student fields
 * - Upserts EmergencyProfile
 * - Replaces EmergencyContacts (full replace, re-prioritized)
 * - Moves Token ISSUED → ACTIVE (activated_at = now)
 */
export async function updateProfile({
  studentId,
  parentId,
  student,
  emergency,
  contacts,
}) {
  // Verify parent-student ownership
  const link = await parentRepo.findParentStudent({ parentId, studentId });
  if (!link) throw new AppError("You do not have access to this student.", 403);

  await parentRepo.saveStudentProfile({
    studentId,
    student,
    emergency,
    contacts,
  });
}
