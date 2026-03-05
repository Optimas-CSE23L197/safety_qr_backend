import bcrypt from "bcrypt";
import crypto from "crypto";
import * as repo from "./auth.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import { HTTP_STATUS, ERROR_MESSAGES } from "../../config/constants.js";
import { encrypt, blindIndex } from "../../utils/encryption.js";
import { generateOtp, hashOtp } from "../../services/otp.service.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import jwt from "jsonwebtoken";
import { auditLog } from "../../utils/auditLogger.js";
import redis from "../../config/redis.js";
import { logger } from "../../config/logger.js";

// =============================================================================
// FIX: verifyOtp now returns expiresAt so mobile can store token metadata
//      without having to decode the JWT itself.
// =============================================================================

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TTL_DAYS = 7;

const otpHashKey = (phone) => `otp:hash:${phone}`;
const otpAttemptsKey = (phone) => `otp:attempts:${phone}`;
const otpRateKey = (phone) => `otp:rate:${phone}`;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const refreshExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TTL_DAYS);
  return d;
};

const verifyPassword = async (plaintext, hash) => {
  const dummy =
    "$2b$10$dummyhashfortimingattackprevention000000000000000000000";
  return bcrypt.compare(plaintext, hash ?? dummy);
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

  if (!admin || !isMatch) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.INVALID_CREDENTIALS,
    );
  }
  if (!admin.is_active) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.ACCOUNT_DISABLED);
  }

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

  if (!user || !isMatch) {
    throw new ApiError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.INVALID_CREDENTIALS,
    );
  }
  if (!user.is_active) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.ACCOUNT_DISABLED);
  }

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
  const rateLocked = await redis.get(otpRateKey(phone));
  if (rateLocked) {
    throw new ApiError(429, "Please wait before requesting another OTP");
  }

  const otp = generateOtp();
  console.log("[DEV] otp ->", otp);
  const otpHash = hashOtp(otp);

  await redis.set(otpHashKey(phone), otpHash, "EX", OTP_TTL_SECONDS);
  await redis.del(otpAttemptsKey(phone));
  await redis.set(otpRateKey(phone), "1", "EX", 60);
  // TODO: await smsQueue.add("send-otp", { phone, otp });

  const phoneIndex = blindIndex(phone);
  const existingParent = await repo.findParentByPhoneIndex(phoneIndex);

  return {
    message: "OTP sent successfully",
    isNewUser: !existingParent,
  };
};

// =============================================================================
// Parent — Step 2: Verify OTP → Login or Register
//
// FIX: Returns expiresAt (Unix seconds) so mobile storage.setTokens()
//      can store token metadata without re-decoding the JWT.
// =============================================================================

export const verifyOtp = async ({ phone, otp, ipAddress, deviceInfo }) => {
  const attempts = parseInt(
    (await redis.get(otpAttemptsKey(phone))) ?? "0",
    10,
  );
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many failed attempts. Request a new OTP.");
  }

  const storedHash = await redis.get(otpHashKey(phone));
  if (!storedHash) {
    throw new ApiError(
      400,
      "OTP expired or not requested. Please request a new OTP.",
    );
  }

  const submittedHash = hashOtp(otp);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(storedHash),
    Buffer.from(submittedHash),
  );

  if (!isValid) {
    await redis.incr(otpAttemptsKey(phone));
    await redis.expire(otpAttemptsKey(phone), OTP_TTL_SECONDS);
    throw new ApiError(HTTP_STATUS.UNAUTHORIZED, "Invalid OTP");
  }

  await Promise.all([
    redis.del(otpHashKey(phone)),
    redis.del(otpAttemptsKey(phone)),
    redis.del(otpRateKey(phone)),
  ]);

  const phoneIndex = blindIndex(phone);
  let parent = await repo.findParentByPhoneIndex(phoneIndex);
  const isNewUser = !parent;

  if (!parent) {
    parent = await repo.createParentUser({
      encryptedPhone: encrypt(phone),
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

  // FIX: Decode expiresAt from access token so mobile can store it
  let expiresAt;
  try {
    expiresAt = jwt.decode(accessToken).exp;
  } catch {
    expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // fallback: 15min
  }

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
    expiresAt, // FIX: included so mobile storage.setTokens works correctly
    parent: { id: parent.id },
    isNewUser,
  };
};

// =============================================================================
// Refresh Token — shared by all three actors
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

  await repo.deleteSession(session.id);

  let payload;
  let sessionData = {};

  if (session.admin_user_id) {
    const admin = await repo.findSuperAdminById(session.admin_user_id);
    if (!admin?.is_active) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHENTICATED,
      );
    }
    payload = { sub: session.admin_user_id, actorType: "super_admin" };
    sessionData = { superAdminId: session.admin_user_id };
  } else if (session.school_user_id) {
    const user = await repo.findSchoolUserById(session.school_user_id);
    if (!user || !user.is_active) {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHENTICATED,
      );
    }
    payload = {
      sub: user.id,
      role: user.role,
      schoolId: user.school_id,
      actorType: "school",
    };
    sessionData = { schoolUserId: user.id };
  } else if (session.parent_user_id) {
    const parent = await repo.findParentById(session.parent_user_id);
    if (!parent || parent.status !== "ACTIVE") {
      throw new ApiError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_MESSAGES.UNAUTHENTICATED,
      );
    }
    payload = { sub: parent.id, role: "PARENT", actorType: "parent" };
    sessionData = { parentUserId: parent.id };
  }

  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

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
  };
};

// =============================================================================
// Logout
// =============================================================================

export const logoutUser = async ({ token, exp, refreshToken }) => {
  await repo.addToBlacklist(hashToken(token), new Date(exp * 1000));

  if (refreshToken) {
    const session = await repo.findSessionByRefreshHash(
      hashToken(refreshToken),
    );
    if (session) await repo.deleteSession(session.id);
  }
};
