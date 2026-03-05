import crypto from "crypto";
import * as parentRepo from "./parent.repository.js";
import redis from "../../config/redis.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import { blindIndex } from "../../utils/encryption.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../../utils/ApiError.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_TTL_SECONDS = 5 * 60;
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

function otpRedisKey(phoneIndex) {
  // Separate namespace from login OTPs to avoid collisions
  return `otp:reg:${phoneIndex}`;
}

// ─── Init Registration ────────────────────────────────────────────────────────
//
// FIX (Ghost Parents): Removed upsertParentByPhone() from here.
// ParentUser is now created ONLY inside completeRegistration() after OTP verify.
// Previously every "Send OTP" tap created a ghost ParentUser row.

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
  if (token.status !== "UNASSIGNED")
    throw new ApiError(409, "This card is already registered.");

  // 3. Compute phone_index using blind index (consistent with auth.service.js)
  const phoneIndex = blindIndex(phone);

  // 4. OTP → Redis
  const otp = generateOtp();
  console.log("[DEV] registration otp ->", otp);
  await redis.set(
    otpRedisKey(phoneIndex),
    JSON.stringify({ code: otp, attempts: 0 }),
    "EX",
    OTP_TTL_SECONDS,
  );

  // 5. Nonce → Postgres — store phone_index here so verifyRegistration
  //    can find it without the broken token→student→parents join
  const nonce = generateNonce();
  await parentRepo.createNonce({
    nonce,
    token_id: token.id,
    expires_at: new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000),
    phone_index: phoneIndex,
  });

  return { nonce, masked_phone: maskPhone(phone) };
}

// ─── Verify Registration ──────────────────────────────────────────────────────
//
// FIX (White screen): Returns proper { accessToken, refreshToken, expiresAt }
// pair instead of a single { jwt }. Previously jwt was used as BOTH tokens —
// every refresh attempt failed → logout → white screen on next app open.
//
// FIX (Ghost Parents): ParentUser created HERE after OTP verified,
// inside the DB transaction. Uses encrypt(phone) for consistency.

export async function verifyRegistration({
  nonce,
  otp,
  ip,
  device_info,
  phone,
}) {
  // 1. Validate nonce
  const nonceRecord = await parentRepo.findNonce(nonce);
  if (!nonceRecord)
    throw new ApiError(400, "Invalid or expired registration link.");
  if (nonceRecord.used)
    throw new ApiError(400, "This registration link has already been used.");
  if (new Date(nonceRecord.expires_at) < new Date())
    throw new ApiError(400, "Registration link expired. Please start again.");

  // 2. Get phone_index from nonce
  const phoneIndex = nonceRecord.phone_index;
  if (!phoneIndex)
    throw new ApiError(
      400,
      "Registration session is invalid. Please start again.",
    );

  // 3. Validate token status
  const token = await parentRepo.findTokenById(nonceRecord.token_id);
  if (!token) throw new ApiError(404, "Token not found.");
  if (token.status !== "UNASSIGNED")
    throw new ApiError(409, "This card has already been registered.");

  // 4. Validate OTP
  const otpRaw = await redis.get(otpRedisKey(phoneIndex));
  if (!otpRaw)
    throw new ApiError(400, "OTP expired. Please request a new one.");

  const otpData = JSON.parse(otpRaw);

  if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpRedisKey(phoneIndex));
    throw new ApiError(
      429,
      "Too many incorrect attempts. Please request a new OTP.",
    );
  }

  if (otpData.code !== otp) {
    await redis.set(
      otpRedisKey(phoneIndex),
      JSON.stringify({ ...otpData, attempts: otpData.attempts + 1 }),
      "KEEPTTL",
    );
    const remaining = OTP_MAX_ATTEMPTS - (otpData.attempts + 1);
    throw new ApiError(
      400,
      `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  await redis.del(otpRedisKey(phoneIndex));

  // 5. Transaction: create ParentUser + student + session atomically
  const { student, session, parentId } = await parentRepo.completeRegistration({
    nonce,
    token_id: token.id,
    school_id: token.school_id,
    phone_index: phoneIndex,
    phone, // raw phone passed for encryption inside repo
    ip,
    device_info,
    session_expires_at: new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ),
  });

  // 6. Generate proper token pair
  const payload = { sub: parentId, role: "PARENT", actorType: "parent" };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  let expiresAt;
  try {
    expiresAt = jwt.decode(accessToken).exp;
  } catch {
    expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    student_id: student.id,
    parent_id: parentId,
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
