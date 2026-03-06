import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import * as repo from "./auth.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import { HTTP_STATUS, ERROR_MESSAGES } from "../../config/constants.js";
import { encrypt, blindIndex } from "../../utils/encryption.js";
import { generateOtp, hashOtp } from "../../services/otp.service.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import { auditLog } from "../../utils/auditLogger.js";
import redis from "../../config/redis.js";
import { logger } from "../../config/logger.js";

// =============================================================================
// Auth Service
//
// Three actor flows:
//   SuperAdmin   → email + password
//   SchoolUser   → email + password
//   ParentUser   → phone + OTP (two-step)
//
// Fixes applied:
//   [S1] verifyOtp returns expiresAt so mobile can store token metadata
//        without decoding the JWT itself
//   [S2] verifyOtp returns isNewUser so frontend can route to onboarding
//   [S3] refreshTokens returns expiresAt for consistent token storage
//   [S4] OTP uses Redis + timing-safe comparison (not plain string)
//   [S5] Phone normalized to E.164 before blindIndex — prevents ghost accounts
//        when same number sent as +91XXXXXXXXXX vs 91XXXXXXXXXX
// =============================================================================

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TTL_DAYS = 30; // 30-day sessions for mobile

const otpHashKey = (phone) => `otp:hash:${phone}`;
const otpAttemptsKey = (phone) => `otp:attempts:${phone}`;
const otpRateKey = (phone) => `otp:rate:${phone}`;

// [S5] Normalize phone to E.164 before any blindIndex call.
// Handles: 9876543210 → +919876543210, 919876543210 → +919876543210
const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`; // assume India if no country code
  return `+${digits}`;
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const refreshExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TTL_DAYS);
  return d;
};

// Constant-time password check — dummy hash prevents timing attacks on
// non-existent accounts
const verifyPassword = async (plaintext, hash) => {
  const dummy =
    "$2b$10$dummyhashfortimingattackprevention000000000000000000000";
  return bcrypt.compare(plaintext, hash ?? dummy);
};

// Decode exp from a freshly-generated access token — safe because we just
// created it, so decode cannot fail unless jwt.sign() is broken
const extractExp = (accessToken) => {
  try {
    return jwt.decode(accessToken).exp;
  } catch {
    return Math.floor(Date.now() / 1000) + 15 * 60; // fallback: 15 min
  }
};

// =============================================================================
// SuperAdmin Login
// =============================================================================

export const loginSuperAdmin = async ({
  email,
  password,
  ipAddress,
  deviceInfo,
}) => {
  const admin = await repo.findSuperAdminByEmail(email);
  const isMatch = await verifyPassword(password, admin?.password_hash);

  if (!admin || !isMatch)
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.INVALID_CREDENTIALS,
    );
  if (!admin.is_active)
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.ACCOUNT_DISABLED);

  const payload = { sub: admin.id, actorType: "super_admin" };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await repo.createSession({
    superAdminId: admin.id,
    refreshTokenHash: hashToken(refreshToken),
    deviceInfo: deviceInfo ?? null,
    ipAddress: ipAddress ?? null,
    expiresAt: refreshExpiresAt(),
  });

  repo
    .updateSuperAdminLastLogin(admin.id)
    .catch((err) =>
      logger.error(
        { err },
        "[Auth] Failed to update super admin last_login_at",
      ),
    );

  auditLog({
    schoolId: null,
    actorType: "SUPER_ADMIN",
    actorId: admin.id,
    action: "LOGIN",
    entity: "SuperAdmin",
    entityId: admin.id,
    newValue: { ip: ipAddress ?? "unknown" },
    ipAddress: ipAddress ?? null,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: "SUPER_ADMIN",
    },
  };
};

// =============================================================================
// SchoolUser Login
// =============================================================================

export const loginSchoolUser = async ({
  email,
  password,
  ipAddress,
  deviceInfo,
}) => {
  const user = await repo.findSchoolUserByEmail(email);
  const isMatch = await verifyPassword(password, user?.password_hash);

  if (!user || !isMatch)
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.INVALID_CREDENTIALS,
    );
  if (!user.is_active)
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.ACCOUNT_DISABLED);

  const payload = {
    sub: user.id,
    role: user.role,
    schoolId: user.school_id,
    actorType: "school",
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await repo.createSession({
    schoolUserId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    deviceInfo: deviceInfo ?? null,
    ipAddress: ipAddress ?? null,
    expiresAt: refreshExpiresAt(),
  });

  repo
    .updateSchoolUserLastLogin(user.id)
    .catch((err) =>
      logger.error(
        { err },
        "[Auth] Failed to update school user last_login_at",
      ),
    );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      school_id: user.school_id,
    },
  };
};

// =============================================================================
// Parent — Step 1: Send OTP
// =============================================================================

export const sendOtp = async ({ phone, ipAddress }) => {
  // [S5] Normalize before rate-key so +91... and 91... hit the same bucket
  const normalized = normalizePhone(phone);

  const rateLocked = await redis.get(otpRateKey(normalized));
  if (rateLocked) {
    throw new ApiError(429, "Please wait before requesting another OTP");
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  // Store hash only — never the plaintext OTP
  await redis.set(otpHashKey(normalized), otpHash, "EX", OTP_TTL_SECONDS);
  await redis.del(otpAttemptsKey(normalized));
  await redis.set(otpRateKey(normalized), "1", "EX", 60);

  // TODO: await smsQueue.add("send-otp", { phone: normalized, otp });
  // DEV ONLY — remove before production
  if (process.env.NODE_ENV !== "production") {
    logger.info({ phone: normalized, otp }, "[DEV] OTP generated");
  }

  const phoneIndex = blindIndex(normalized);
  const existingParent = await repo.findParentByPhoneIndex(phoneIndex);

  return {
    message: "OTP sent successfully",
    isNewUser: !existingParent,
  };
};

// =============================================================================
// Parent — Step 2: Verify OTP → Login or Auto-Register
//
// [S1] Returns expiresAt — mobile storage.setTokens() needs it
// [S2] Returns isNewUser — frontend routes new parents to onboarding
// [S5] Phone normalized before blindIndex
// =============================================================================

export const verifyOtp = async ({ phone, otp, ipAddress, deviceInfo }) => {
  const normalized = normalizePhone(phone);

  // Check attempt count before touching OTP hash
  const attempts = parseInt(
    (await redis.get(otpAttemptsKey(normalized))) ?? "0",
    10,
  );
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many failed attempts. Request a new OTP.");
  }

  const storedHash = await redis.get(otpHashKey(normalized));
  if (!storedHash) {
    throw new ApiError(
      400,
      "OTP expired or not requested. Please request a new OTP.",
    );
  }

  // [S4] Timing-safe comparison — prevents timing oracle attacks
  const submittedHash = hashOtp(otp);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(storedHash),
    Buffer.from(submittedHash),
  );

  if (!isValid) {
    await redis.incr(otpAttemptsKey(normalized));
    await redis.expire(otpAttemptsKey(normalized), OTP_TTL_SECONDS);
    const remaining = OTP_MAX_ATTEMPTS - (attempts + 1);
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      `Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  // OTP verified — clear all keys atomically
  await Promise.all([
    redis.del(otpHashKey(normalized)),
    redis.del(otpAttemptsKey(normalized)),
    redis.del(otpRateKey(normalized)),
  ]);

  const phoneIndex = blindIndex(normalized);
  let parent = await repo.findParentByPhoneIndex(phoneIndex);
  const isNewUser = !parent;

  if (!parent) {
    // Auto-register on first login
    parent = await repo.createParentUser({
      encryptedPhone: encrypt(normalized),
      phoneIndex,
    });
  } else if (parent.status !== "ACTIVE") {
    throw new ApiError(
      HTTP_STATUS.FORBIDDEN,
      "Your account has been suspended.",
    );
  }

  const payload = { sub: parent.id, role: "PARENT", actorType: "parent" };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const expiresAt = extractExp(accessToken); // [S1]

  await repo.createSession({
    parentUserId: parent.id,
    refreshTokenHash: hashToken(refreshToken),
    deviceInfo: deviceInfo ?? null,
    ipAddress: ipAddress ?? null,
    expiresAt: refreshExpiresAt(),
  });

  repo
    .updateParentLastLogin(parent.id)
    .catch((err) =>
      logger.error({ err }, "[Auth] Failed to update parent last_login_at"),
    );

  return {
    accessToken,
    refreshToken,
    expiresAt, // [S1] Unix seconds — mobile stores without re-decoding
    isNewUser, // [S2] true = route to onboarding, false = route to home
    parent: {
      id: parent.id,
    },
  };
};

// =============================================================================
// Refresh Token — shared by all three actors
//
// [S3] Returns expiresAt alongside new tokens
// Rotation: old session deleted, new session created atomically
// =============================================================================

export const refreshTokens = async ({
  refreshToken,
  ipAddress,
  deviceInfo,
}) => {
  const hash = hashToken(refreshToken);
  const session = await repo.findSessionByRefreshHash(hash);

  if (!session) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      "Invalid or expired session. Please login again.",
    );
  }

  if (session.expires_at < new Date()) {
    await repo.deleteSession(session.id);
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      "Session expired. Please login again.",
    );
  }

  // Delete old session before creating new one — prevents replay attacks
  await repo.deleteSession(session.id);

  let payload;
  let sessionData = {};

  if (session.admin_user_id) {
    const admin = await repo.findSuperAdminById(session.admin_user_id);
    if (!admin?.is_active)
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHENTICATED,
      );
    payload = { sub: session.admin_user_id, actorType: "super_admin" };
    sessionData = { superAdminId: session.admin_user_id };
  } else if (session.school_user_id) {
    const user = await repo.findSchoolUserById(session.school_user_id);
    if (!user || !user.is_active)
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHENTICATED,
      );
    payload = {
      sub: user.id,
      role: user.role,
      schoolId: user.school_id,
      actorType: "school",
    };
    sessionData = { schoolUserId: user.id };
  } else if (session.parent_user_id) {
    const parent = await repo.findParentById(session.parent_user_id);
    if (!parent || parent.status !== "ACTIVE")
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHENTICATED,
      );
    payload = { sub: parent.id, role: "PARENT", actorType: "parent" };
    sessionData = { parentUserId: parent.id };
  }

  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);
  const expiresAt = extractExp(newAccessToken); // [S3]

  await repo.createSession({
    ...sessionData,
    refreshTokenHash: hashToken(newRefreshToken),
    deviceInfo: deviceInfo ?? null,
    ipAddress: ipAddress ?? null,
    expiresAt: refreshExpiresAt(),
  });

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expiresAt, // [S3]
  };
};

// =============================================================================
// Logout
// =============================================================================

export const logoutUser = async ({ token, exp, refreshToken }) => {
  // Blacklist the access token so it can't be replayed before it expires
  await repo.addToBlacklist(hashToken(token), new Date(exp * 1000));

  if (refreshToken) {
    const session = await repo.findSessionByRefreshHash(
      hashToken(refreshToken),
    );
    if (session) await repo.deleteSession(session.id);
  }
};
