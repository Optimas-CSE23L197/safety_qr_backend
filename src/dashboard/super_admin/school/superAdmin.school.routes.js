// Routes — Super Admin School Management
//
// POST   /v1/super-admin/schools/register      Register school + admin + subscription
// GET    /v1/super-admin/schools                List all schools (paginated + filtered)
// GET    /v1/super-admin/schools/:id            Get school detail by ID
// PATCH  /v1/super-admin/schools/:id/activate   Activate a school
// PATCH  /v1/super-admin/schools/:id/deactivate Deactivate + revoke all sessions
//
// Planned (not yet implemented):
// PATCH  /v1/super-admin/schools/:id/logo       Upload school logo
// GET    /v1/super-admin/schools/:id/users       List school admin users
// GET    /v1/super-admin/schools/:id/tokens      List school tokens
// GET    /v1/super-admin/schools/:id/subscription View subscription
// DELETE /v1/super-admin/schools/:id            Hard delete (deactivate first)

import { Router } from "express";
import { requireAuth } from "../../../middlewares/auth.middleware.js";
import { authorize } from "../../../middlewares/rbac.middleware.js";
import { validate } from "../../../middlewares/validate.middleware.js";
import {
  registerSchoolController,
  getAllSchoolsController,
  getSchoolByIdController,
  activateSchoolController,
  deactivateSchoolController,
} from "./superAdmin.school.controller.js";
import {
  registerSchoolValidation,
  listSchoolsQueryValidation,
  uuidParamSchema,
} from "./superAdmin.school.validation.js";

const router = Router();

// All routes in this file require a valid JWT + SUPER_ADMIN role
router.use(requireAuth);
router.use(authorize(["SUPER_ADMIN"]));

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

router.post(
  "/register",
  validate({ body: registerSchoolValidation }),
  registerSchoolController,
);

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

router.get(
  "/",
  validate({ query: listSchoolsQueryValidation }),
  getAllSchoolsController,
);

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

router.get(
  "/:id",
  validate({ params: uuidParamSchema }),
  getSchoolByIdController,
);

// ---------------------------------------------------------------------------
// PATCH /:id/activate
// ---------------------------------------------------------------------------

router.patch(
  "/:id/activate",
  validate({ params: uuidParamSchema }),
  activateSchoolController,
);

// ---------------------------------------------------------------------------
// PATCH /:id/deactivate
// ---------------------------------------------------------------------------

router.patch(
  "/:id/deactivate",
  validate({ params: uuidParamSchema }),
  deactivateSchoolController,
);

export default router;
