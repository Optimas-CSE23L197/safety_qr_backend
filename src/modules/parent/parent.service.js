import crypto from "crypto";
import * as parentRepo from "./parent.repository.js";
import redis from "../../config/redis.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { ApiError } from "../../utils/ApiError.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;
const NONCE_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function generateNonce() {
  return crypto.randomBytes(32).toString("hex");
}

function maskPhone(phone) {
  if (phone.length < 5) return "****";
  return phone.slice(0, -6).replace(/\d/g, "*") + phone.slice(-4);
}

function otpRedisKey(phone_index) {
  return `otp:${phone_index}`;
}

// ─── Init Registration ────────────────────────────────────────────────────────

export async function initRegistration({ card_number, phone }) {
  // 1. Card lookup
  const card = await parentRepo.findCardByNumber(card_number);
  if (!card)
    throw new ApiError(404, "Card not found. Check the number and try again.");
  if (!card.token_id)
    throw new ApiError(
      400,
      "This card has no token assigned. Contact your school.",
    );

  // 2. Token must be UNASSIGNED
  const token = await parentRepo.findTokenById(card.token_id);
  if (!token) throw new ApiError(404, "Token not found.");
  if (token.status !== "UNASSIGNED") {
    throw new ApiError(409, "This card is already registered.");
  }

  // 3. Normalise phone → phone_index
  const phoneIndex = phone.replace(/\s+/g, "").toLowerCase();

  // 4. Find or create parent by phone
  await parentRepo.upsertParentByPhone({ phone, phone_index: phoneIndex });

  // 5. OTP → Redis
  const otp = generateOtp();
  console.log("[DEV] otp ->", otp); // remove before production
  const otpKey = otpRedisKey(phoneIndex);
  await redis.set(
    otpKey,
    JSON.stringify({ code: otp, attempts: 0 }),
    "EX",
    OTP_TTL_SECONDS,
  );

  // 6. Nonce → Postgres
  //    FIX: store phone_index on the nonce so verifyRegistration can retrieve
  //    it without relying on the token→student→parents join (which doesn't
  //    exist yet because the token is still UNASSIGNED at this point).
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);
  await parentRepo.createNonce({
    nonce,
    token_id: token.id,
    expires_at: expiresAt,
    phone_index: phoneIndex, // ← THE FIX
  });

  // 7. SMS — fire and forget
  // sendOtp(phone, otp).catch((err) => {
  //   console.error(`[SMS] Failed to send OTP to ${maskPhone(phone)}:`, err.message);
  // });

  return {
    nonce,
    masked_phone: maskPhone(phone),
  };
}

// ─── Verify Registration ──────────────────────────────────────────────────────

export async function verifyRegistration({ nonce, otp, ip, device_info }) {
  // 1. Validate nonce
  const nonceRecord = await parentRepo.findNonce(nonce);
  if (!nonceRecord)
    throw new ApiError(400, "Invalid or expired registration link.");
  if (nonceRecord.used)
    throw new ApiError(400, "This registration link has already been used.");
  if (new Date(nonceRecord.expires_at) < new Date())
    throw new ApiError(400, "Registration link expired. Please start again.");

  // 2. Get phone_index from nonce (stored during initRegistration)
  //    FIX: was reading token.parent_phone_index via a join that returned null
  //    for UNASSIGNED tokens (no student linked yet).
  const phoneIndex = nonceRecord.phone_index;
  if (!phoneIndex)
    throw new ApiError(
      400,
      "Registration session is invalid. Please start again.",
    );

  // 3. Get token → validate status + get school_id
  const token = await parentRepo.findTokenById(nonceRecord.token_id);
  if (!token) throw new ApiError(404, "Token not found.");
  if (token.status !== "UNASSIGNED")
    throw new ApiError(409, "This card has already been registered.");

  // 4. Validate OTP from Redis
  const otpKey = otpRedisKey(phoneIndex);
  const otpRaw = await redis.get(otpKey);
  if (!otpRaw)
    throw new ApiError(400, "OTP expired. Please request a new one.");

  const otpData = JSON.parse(otpRaw);

  if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey);
    throw new ApiError(
      429,
      "Too many incorrect attempts. Please request a new OTP.",
    );
  }

  if (otpData.code !== otp) {
    await redis.set(
      otpKey,
      JSON.stringify({ ...otpData, attempts: otpData.attempts + 1 }),
      "KEEPTTL",
    );
    const remaining = OTP_MAX_ATTEMPTS - (otpData.attempts + 1);
    throw new ApiError(
      400,
      `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  // OTP matched — delete immediately (single use)
  await redis.del(otpKey);

  // 5. Single transaction: create everything
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

  // 6. Sign JWT
  const jwt = generateAccessToken({
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

export async function updateProfile({
  studentId,
  parentId,
  student,
  emergency,
  contacts,
}) {
  const link = await parentRepo.findParentStudent({ parentId, studentId });
  if (!link) throw new ApiError(403, "You do not have access to this student.");

  await parentRepo.saveStudentProfile({
    studentId,
    student,
    emergency,
    contacts,
  });
}
