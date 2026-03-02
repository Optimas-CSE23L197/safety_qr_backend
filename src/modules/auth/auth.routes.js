import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authRateLimiter } from "../../middlewares/rateLimit.middleware.js";
import { authSlowDown } from "../../middlewares/slowDown.middleware.js";
import {
  emailPasswordValidation,
  sendOtpValidation,
  verifyOtpValidation,
} from "./auth.validation.js";
import {
  loginSuperAdminController,
  loginSchoolUserController,
  sendOtpController,
  verifyOtpController,
  refreshTokenController,
  logoutController,
} from "./auth.controller.js";

const router = Router();

// =============================================================================
// Super Admin Login
// POST /auth/super-admin
//
// actorType: "super_admin" in JWT
// No school_id — platform-wide access
// =============================================================================

router.post(
  "/super-admin",
  authSlowDown,
  authRateLimiter,
  validate({ body: emailPasswordValidation }),
  loginSuperAdminController,
);

// =============================================================================
// School User Login
// POST /auth/school
//
// actorType: "school" in JWT
// role: ADMIN | STAFF | VIEWER
// school_id attached — scoped by scopeToTenant middleware on protected routes
// =============================================================================

router.post(
  "/school",
  authSlowDown,
  authRateLimiter,
  validate({ body: emailPasswordValidation }),
  loginSchoolUserController,
);

// =============================================================================
// Parent Login — two-step OTP flow
//
// Step 1: POST /auth/parent/send-otp   → sends OTP to phone
// Step 2: POST /auth/parent/verify-otp → verifies OTP, returns tokens
//
// actorType: "parent" in JWT
// On first login: account is auto-created after OTP verification
// =============================================================================

router.post(
  "/parent/send-otp",
  authRateLimiter,
  validate({ body: sendOtpValidation }),
  sendOtpController,
);

router.post(
  "/parent/verify-otp",
  authRateLimiter,
  validate({ body: verifyOtpValidation }),
  verifyOtpController,
);

// =============================================================================
// Refresh Token
// POST /auth/refresh
//
// Shared by all three actors.
// Actor type is determined from the session record — no actor-specific routes needed.
// Old refresh token is deleted and a new one is issued (rotation).
// =============================================================================

router.post("/refresh", authRateLimiter, refreshTokenController);

// =============================================================================
// Logout
// POST /auth/logout
//
// Shared by all three actors.
// requireAuth verifies the token and sets req.user before this runs.
// Blacklists access token + deletes session.
// =============================================================================

router.post("/logout", requireAuth, logoutController);

export default router;
