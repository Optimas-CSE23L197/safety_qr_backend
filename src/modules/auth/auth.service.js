import bcrypt from "bcrypt";
import crypto from "crypto";
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
// Constants
// =============================================================================

const OTP_TTL_SECONDS = 5 * 60; // OTP valid for 5 minutes
const OTP_MAX_ATTEMPTS = 5; // lockout after 5 wrong guesses
const REFRESH_TTL_DAYS = 7;

// Redis key factories
const otpHashKey = (phone) => `otp:hash:${phone}`;
const otpAttemptsKey = (phone) => `otp:attempts:${phone}`;
const otpRateKey = (phone) => `otp:rate:${phone}`;

// =============================================================================
// Helpers
// =============================================================================

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const refreshExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TTL_DAYS);
  return d;
};

// Shared login logic for email+password actors
// Always runs bcrypt even when user not found — prevents timing attacks
// that reveal whether an email exists in the system
const verifyPassword = async (plaintext, hash) => {
  const dummy =
    "$2b$10$dummyhashfortimingattackprevention000000000000000000000";
  return bcrypt.compare(plaintext, hash ?? dummy);
};

// =============================================================================
// SuperAdmin Login
//
// Flow:
//   1. Find SuperAdmin by email
//   2. Verify password (always runs bcrypt)
//   3. Check is_active
//   4. Generate tokens + store session
//   5. Update last_login_at (fire and forget)
//   6. Always write audit log — every super admin login is recorded
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

  const payload = {
    sub: admin.id,
    actorType: "super_admin",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await repo.createSession({
    superAdminId: admin.id,
    refreshTokenHash: hashToken(refreshToken),
    deviceInfo: deviceInfo ?? null,
    ipAddress: ipAddress ?? null,
    expiresAt: refreshExpiresAt(),
  });

  // Fire and forget — never block login response
  repo
    .updateSuperAdminLastLogin(admin.id)
    .catch((err) =>
      logger.error(
        { err },
        "[Auth] Failed to update super admin last_login_at",
      ),
    );

  // Always audit super admin logins
  logger.info(
    {
      event: "SUPER_ADMIN_LOGIN",
      adminId: admin.id,
      email: admin.email,
      ipAddress: ipAddress ?? "unknown",
      timestamp: new Date().toISOString(),
    },
    "Super admin login",
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
//
// Flow:
//   1. Find SchoolUser by email
//   2. Verify password
//   3. Check is_active
//   4. Generate tokens + store session
//   5. Update last_login_at (fire and forget)
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
    role: user.role, // SchoolRole: ADMIN | STAFF | VIEWER
    schoolId: user.school_id, // required by scopeToTenant middleware
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
      school_name: null,
    },
  };
};

// =============================================================================
// Parent — Step 1: Send OTP
//
// Flow:
//   1. Rate limit — max 1 OTP request per minute per phone
//   2. Generate OTP, store hash in Redis with TTL
//   3. Send SMS (dev: log to console, prod: queue to SMS worker)
// =============================================================================

export const sendOtp = async ({ phone, ipAddress }) => {
  // Rate limit — 1 OTP per minute per phone number
  const rateLocked = await redis.get(otpRateKey(phone));
  if (rateLocked) {
    throw new ApiError(429, "Please wait before requesting another OTP");
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  // Store hash not raw OTP — Redis breach won't expose OTPs
  await redis.set(otpHashKey(phone), otpHash, "EX", OTP_TTL_SECONDS);
  await redis.del(otpAttemptsKey(phone)); // reset attempt counter
  await redis.set(otpRateKey(phone), "1", "EX", 60); // 60s cooldown

  if (process.env.NODE_ENV === "development") {
    // Only log OTP in development — never in production
    logger.info({ phone, otp }, "[Auth] DEV OTP");
  } else {
    // TODO: await smsQueue.add("send-otp", { phone, otp });
    logger.info({ phone }, "[Auth] OTP dispatched");
  }

  // Check if parent already exists — lets frontend show correct UI
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
// Flow:
//   1. Check attempt count (lockout after OTP_MAX_ATTEMPTS wrong guesses)
//   2. Get stored OTP hash from Redis
//   3. Constant-time comparison
//   4. Find or create ParentUser
//   5. Generate tokens + store session
// =============================================================================

export const verifyOtp = async ({ phone, otp, ipAddress, deviceInfo }) => {
  // Step 1: Brute force protection
  const attempts = parseInt(
    (await redis.get(otpAttemptsKey(phone))) ?? "0",
    10,
  );
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many failed attempts. Request a new OTP.");
  }

  // Step 2: Get stored hash
  const storedHash = await redis.get(otpHashKey(phone));
  if (!storedHash) {
    throw new ApiError(
      400,
      "OTP expired or not requested. Please request a new OTP.",
    );
  }

  // Step 3: Constant-time comparison — prevents timing attacks on OTP
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

  // Step 4: OTP valid — clean up Redis immediately
  await Promise.all([
    redis.del(otpHashKey(phone)),
    redis.del(otpAttemptsKey(phone)),
    redis.del(otpRateKey(phone)),
  ]);

  // Find or create parent
  const phoneIndex = blindIndex(phone);
  let parent = await repo.findParentByPhoneIndex(phoneIndex);

  if (!parent) {
    // First time — create account with encrypted phone
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

  // Step 5: Generate tokens
  const payload = {
    sub: parent.id,
    role: "PARENT",
    actorType: "parent",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

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
    parent: { id: parent.id },
    isNewUser: !parent.is_phone_verified,
  };
};

// =============================================================================
// Refresh Token — shared by all three actors
//
// Flow:
//   1. Hash incoming refresh token → look up session
//   2. Check session not expired
//   3. Delete old session (rotation — one time use)
//   4. Load user and rebuild payload
//   5. Issue new access + refresh tokens + new session
//
// Token rotation means: if a refresh token is stolen and used,
// the real user's next refresh will fail (session already deleted)
// which alerts them to re-login.
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

  // Delete old session before issuing new one (rotation)
  await repo.deleteSession(session.id);

  let payload;
  let sessionData = {};

  if (session.admin_user_id) {
    // SuperAdmin refresh
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
    // SchoolUser refresh
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
    // ParentUser refresh
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

  // refreshTokens return
  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
  };
};

// =============================================================================
// Logout — shared by all three actors
//
// Blacklists the access token + deletes the session.
// requireAuth already verified the token — service receives only what it needs.
// =============================================================================

export const logoutUser = async ({ token, exp, refreshToken }) => {
  // Blacklist access token so it can't be reused until it naturally expires
  await repo.addToBlacklist(hashToken(token), new Date(exp * 1000));

  // Delete session to invalidate refresh token too
  if (refreshToken) {
    const session = await repo.findSessionByRefreshHash(
      hashToken(refreshToken),
    );
    if (session) await repo.deleteSession(session.id);
  }
};
