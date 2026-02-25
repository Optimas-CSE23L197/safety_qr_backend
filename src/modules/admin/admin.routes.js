import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { authRateLimiter } from "../../middlewares/rateLimit.middleware.js";
import { ROLES } from "../../config/constants.js";

import { createAdminSchema, updateAdminSchema } from "./admin.validation.js";

import {
  registerAdminController,
  updateAdminController,
  deleteAdminController,
} from "./admin.controller.js";

const router = Router();

router.post(
  "/register",
  requireAuth,
  authorize(ROLES.SUPER_ADMIN),
  authRateLimiter,
  validate({ body: createAdminSchema }),
  registerAdminController,
);

router.patch(
  "/:adminId",
  requireAuth,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate({ body: updateAdminSchema }),
  updateAdminController,
);

router.delete(
  "/:adminId",
  requireAuth,
  authorize(ROLES.SUPER_ADMIN),
  authRateLimiter,
  deleteAdminController,
);

export default router;
