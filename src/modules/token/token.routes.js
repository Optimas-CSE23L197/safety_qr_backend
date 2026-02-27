import { Router } from "express";
import {
  generateSingleBlank,
  generateBulkBlank,
  generateSinglePreloaded,
  generateBulkPreloaded,
} from "./token.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";

const router = Router();

// All QR generation routes require authentication
// SUPER_ADMIN: cross-tenant, must provide schoolId in body
// ADMIN: school-scoped, schoolId resolved from auth context automatically
router.use(requireAuth);
router.use(authorize(["SUPER_ADMIN", "ADMIN"]));

// =============================================================================
// BLANK TOKEN ROUTES (no student attached)
// =============================================================================

// POST /api/qr/blank/single
// Body (school admin):  { notes? }
// Body (super admin):   { schoolId, notes? }
router.post("/blank/single", generateSingleBlank);

// POST /api/qr/blank/bulk
// Body (school admin):  { count, notes? }
// Body (super admin):   { schoolId, count, notes? }
router.post("/blank/bulk", generateBulkBlank);

// =============================================================================
// PRELOADED TOKEN ROUTES (student attached immediately)
// =============================================================================

// POST /api/qr/preloaded/single
// Body (school admin):  { studentId }
// Body (super admin):   { schoolId, studentId }
router.post("/preloaded/single", generateSinglePreloaded);

// POST /api/qr/preloaded/bulk
// Body (school admin):  { studentIds, notes? }
// Body (super admin):   { schoolId, studentIds, notes? }
router.post("/preloaded/bulk", generateBulkPreloaded);

export default router;
