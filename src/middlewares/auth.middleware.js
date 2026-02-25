import crypto from "crypto";
import { ApiError } from "../utils/ApiError.js";
import { ERROR_MESSAGES, HTTP_STATUS } from "../config/constants.js";
import prisma from "../config/prisma.js";
import { verifyAccessToken } from "../utils/jwt.js";

// =============================================================================
// requireAuth middleware
//
// Three actor types — each maps to its own DB model:
//
//   "super_admin" → prisma.superAdmin  (you and your 2 friends)
//   "school"      → prisma.schoolUser  (ADMIN | STAFF | VIEWER)
//   "parent"      → prisma.parentUser
//
// Sets req.user = { id, role, actorType, school_id?, exp }
// =============================================================================

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(
      new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHENTICATED),
    );
  }

  const token = authHeader.split(" ")[1];

  try {
    // Step 1: Verify JWT signature first
    // Invalid/expired tokens are rejected here — no DB hit
    const decoded = verifyAccessToken(token);

    // Step 2: Check blacklist — catches logged-out tokens
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const blacklisted = await prisma.blacklistToken.findUnique({
      where: { token_hash: tokenHash },
      select: { token_hash: true },
    });

    if (blacklisted) {
      return next(
        new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.TOKEN_REVOKED),
      );
    }

    // Step 3: Load fresh user data from DB based on actorType
    const { actorType } = decoded;

    if (actorType === "super_admin") {
      // ── SuperAdmin ────────────────────────────────────────────────────────
      const user = await prisma.superAdmin.findUnique({
        where: { id: decoded.sub },
        select: { id: true, is_active: true },
      });

      if (!user) {
        return next(
          new ApiError(
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_MESSAGES.UNAUTHENTICATED,
          ),
        );
      }
      if (!user.is_active) {
        return next(new ApiError(HTTP_STATUS.FORBIDDEN, "Account is inactive"));
      }

      req.user = {
        id: user.id,
        role: "SUPER_ADMIN", // fixed role — no enum needed
        actorType: "super_admin",
        exp: decoded.exp,
      };
    } else if (actorType === "school") {
      // ── SchoolUser ────────────────────────────────────────────────────────
      const user = await prisma.schoolUser.findUnique({
        where: { id: decoded.sub },
        select: { id: true, school_id: true, role: true, is_active: true },
      });

      if (!user) {
        return next(
          new ApiError(
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_MESSAGES.UNAUTHENTICATED,
          ),
        );
      }
      if (!user.is_active) {
        return next(new ApiError(HTTP_STATUS.FORBIDDEN, "Account is inactive"));
      }

      req.user = {
        id: user.id,
        school_id: user.school_id, // consumed by scopeToTenant middleware
        role: user.role, // SchoolRole: ADMIN | STAFF | VIEWER
        actorType: "school",
        exp: decoded.exp,
      };
    } else if (actorType === "parent") {
      // ── ParentUser ────────────────────────────────────────────────────────
      const user = await prisma.parentUser.findUnique({
        where: { id: decoded.sub },
        select: { id: true, status: true },
      });

      if (!user) {
        return next(
          new ApiError(
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_MESSAGES.UNAUTHENTICATED,
          ),
        );
      }
      if (user.status !== "ACTIVE") {
        return next(
          new ApiError(HTTP_STATUS.FORBIDDEN, "Account is suspended"),
        );
      }

      req.user = {
        id: user.id,
        role: "PARENT",
        actorType: "parent",
        exp: decoded.exp,
      };
    } else {
      return next(
        new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHENTICATED),
      );
    }

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(
        new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.TOKEN_EXPIRED),
      );
    }
    return next(
      new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHENTICATED),
    );
  }
};
