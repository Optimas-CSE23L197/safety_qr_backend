import { Router } from "express";
import {
  generateSingleBlank,
  generateBulkBlank,
  generateSinglePreloaded,
  generateBulkPreloaded,
} from "./qr.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";

const router = Router();

// All QR generation routes require authentication
// Only SUPER_ADMIN and ADMIN can generate tokens
router.use(requireAuth);
router.use(authorize(["SUPER_ADMIN"]));

// =============================================================================
// BLANK TOKEN ROUTES (no student attached)
// =============================================================================

// POST /api/qr/blank/single
// Body: { notes? }
router.post("/blank/single", generateSingleBlank);

// POST /api/qr/blank/bulk
// Body: { count: number, notes? }
router.post("/blank/bulk", generateBulkBlank);

// =============================================================================
// PRELOADED TOKEN ROUTES (student attached immediately)
// =============================================================================

// POST /api/qr/preloaded/single
// Body: { studentId: uuid }
router.post("/preloaded/single", generateSinglePreloaded);

// POST /api/qr/preloaded/bulk
// Body: { studentIds: uuid[], notes? }
router.post("/preloaded/bulk", generateBulkPreloaded);

export default router;
