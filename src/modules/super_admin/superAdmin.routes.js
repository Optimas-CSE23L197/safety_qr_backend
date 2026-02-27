// POST   /v1/super-admins                    # Register new super admin
// GET    /v1/super-admins                    # List all super admins (paginated)
// GET    /v1/super-admins/:id               # Get super admin by ID
// PATCH  /v1/super-admins/:id               # Update name / is_active
// PATCH  /v1/super-admins/:id/password      # Change password
// DELETE /v1/super-admins/:id               # Soft delete super admin

import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  getAllSuperAdminsController,
  getSuperAdminByIdController,
  registerSuperAdminController,
  updateSuperAdminController,
  changeSuperAdminPasswordController,
  deleteSuperAdminController,
} from "./superAdmin.controller.js";
import {
  registerSuperAdminSchema,
  updateSuperAdminSchema,
  changePasswordSchema,
  paginationSchema,
  uuidParamSchema,
} from "./superAdmin.validation.js";

const router = Router();

//////////////////////////////
//! Global guards — all routes require auth + SUPER_ADMIN role
//////////////////////////////

router.use(requireAuth);
router.use(authorize(["SUPER_ADMIN"]));

//////////////////////////////
//! Routes
//////////////////////////////

// GET /v1/super-admins
// Query params: page, limit, search, is_active
router.get(
  "/",
  validate({ query: paginationSchema }),
  getAllSuperAdminsController,
);

// GET /v1/super-admins/:id
router.get(
  "/:id",
  validate({ params: uuidParamSchema }),
  getSuperAdminByIdController,
);

// POST /v1/super-admins
router.post(
  "/",
  validate({ body: registerSuperAdminSchema }),
  registerSuperAdminController,
);

// PATCH /v1/super-admins/:id
router.patch(
  "/:id",
  validate({ params: uuidParamSchema, body: updateSuperAdminSchema }),
  updateSuperAdminController,
);

// PATCH /v1/super-admins/:id/password
router.patch(
  "/:id/password",
  validate({ params: uuidParamSchema, body: changePasswordSchema }),
  changeSuperAdminPasswordController,
);

// DELETE /v1/super-admins/:id
router.delete(
  "/:id",
  validate({ params: uuidParamSchema }),
  deleteSuperAdminController,
);

export default router;
