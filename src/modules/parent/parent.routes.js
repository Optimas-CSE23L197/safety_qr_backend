import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  validateRegisterInit,
  validateRegisterVerify,
  validateUpdateStudent,
} from "./parent.validation.js";
import {
  registerInit,
  registerVerify,
  updateStudentProfile,
  getParentMe,
} from "./parent.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";

const router = Router();

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * POST /api/parent/auth/register/init
 * Body: { card_number, phone }
 * - Looks up card → token (must be UNASSIGNED)
 * - Creates/finds ParentUser by phone
 * - Generates OTP → Redis (5 min TTL)
 * - Creates RegistrationNonce → Postgres (15 min TTL)
 * - Sends OTP via SMS (async, non-blocking)
 * - Returns: { nonce, masked_phone }
 */
router.post("/register/init", validate(validateRegisterInit), registerInit);

/**
 * POST /api/parent/auth/register/verify
 * Body: { nonce, otp }
 * - Validates nonce (unused, not expired)
 * - Validates OTP from Redis (max 3 attempts)
 * - Single DB transaction:
 *     nonce → used
 *     ParentUser created/updated
 *     Student shell created (school_id only)
 *     ParentStudent link created
 *     Token UNASSIGNED → ISSUED
 *     Session created
 * - Returns: { jwt, student_id, isProfileComplete: false }
 */
router.post(
  "/register/verify",
  validate(validateRegisterVerify),
  registerVerify,
);

// ─── Student Profile Update ───────────────────────────────────────────────────

/**
 * PATCH /api/parent/student/:studentId
 * Header: Authorization: Bearer <jwt>
 * Body: { student?, emergency?, contacts? }
 * - Upserts Student fields
 * - Upserts EmergencyProfile
 * - Replaces EmergencyContacts (full replace, re-numbered by priority)
 * - Token ISSUED → ACTIVE (activated_at = now)
 * - Returns: { success: true }
 */
router.patch(
  "/student/:studentId",
  requireAuth,
  authorize(["parent"]),
  validate(validateUpdateStudent),
  updateStudentProfile,
);

// Add this route (protected):
router.get("/me", requireAuth, authorize(["parent"]), getParentMe);

export default router;
