// POST   /v1/schools                          # Register a new school         [SUPER_ADMIN]
// GET    /v1/schools                          # List all schools               [SUPER_ADMIN | SCHOOL_ADMIN own]
// GET    /v1/schools/:id                      # Get school by ID               [SUPER_ADMIN | SCHOOL_ADMIN own]
// GET    /v1/schools/code/:code              # Get school by unique code       [SUPER_ADMIN | SCHOOL_ADMIN own]
// PATCH  /v1/schools/:id                     # Update school details           [SUPER_ADMIN]
// PATCH  /v1/schools/:id/logo               # Upload / update school logo     [SUPER_ADMIN]
// PATCH  /v1/schools/:id/activate           # Re-activate a school            [SUPER_ADMIN]
// PATCH  /v1/schools/:id/deactivate         # Soft deactivate a school        [SUPER_ADMIN]
// DELETE /v1/schools/:id                     # Hard delete                     [SUPER_ADMIN]

import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { restrictToOwnSchool } from "../../middlewares/restrictToOwnSchool.middleware.js";
import {
  getAllSchoolsController,
  getSchoolByIdController,
  getSchoolByCodeController,
  createSchoolController,
  updateSchoolController,
  uploadSchoolLogoController,
  activateSchoolController,
  deactivateSchoolController,
  deleteSchoolController,
} from "./school.controller.js";
import {
  listSchoolsSchema,
  createSchoolSchema,
  updateSchoolSchema,
  uuidParamSchema,
  codeParamSchema,
} from "./school.validation.js";

const router = Router();

// ---------------------------------------------------------------------------
// All routes require a valid JWT
// ---------------------------------------------------------------------------

router.use(requireAuth);

// ---------------------------------------------------------------------------
// READ routes — SUPER_ADMIN or SCHOOL_ADMIN (own school only)
//
// Middleware chain:
//   authorize(["SUPER_ADMIN", "SCHOOL_ADMIN"])  — rejects any other role
//   restrictToOwnSchool                         — SUPER_ADMIN: pass through
//                                                 SCHOOL_ADMIN: enforce own school
// ---------------------------------------------------------------------------

// IMPORTANT: /code/:code must be declared before /:id
// Express matches in declaration order — "code" would be swallowed as an ID otherwise

// GET /v1/schools
router.get(
  "/",
  authorize(["SUPER_ADMIN", "SCHOOL_ADMIN"]),
  validate({ query: listSchoolsSchema }),
  restrictToOwnSchool,
  getAllSchoolsController,
);

// GET /v1/schools/code/:code  ← before /:id
router.get(
  "/code/:code",
  authorize(["SUPER_ADMIN", "SCHOOL_ADMIN"]),
  validate({ params: codeParamSchema }),
  restrictToOwnSchool,
  getSchoolByCodeController,
);

// GET /v1/schools/:id
router.get(
  "/:id",
  authorize(["SUPER_ADMIN", "SCHOOL_ADMIN"]),
  validate({ params: uuidParamSchema }),
  restrictToOwnSchool,
  getSchoolByIdController,
);

// ---------------------------------------------------------------------------
// WRITE routes — SUPER_ADMIN only
// ---------------------------------------------------------------------------

// POST /v1/schools
router.post(
  "/",
  authorize(["SUPER_ADMIN"]),
  validate({ body: createSchoolSchema }),
  createSchoolController,
);

// PATCH /v1/schools/:id
router.patch(
  "/:id",
  authorize(["SUPER_ADMIN"]),
  validate({ params: uuidParamSchema, body: updateSchoolSchema }),
  updateSchoolController,
);

// PATCH /v1/schools/:id/logo
router.patch(
  "/:id/logo",
  authorize(["SUPER_ADMIN"]),
  validate({ params: uuidParamSchema }),
  upload.single("logo"),
  uploadSchoolLogoController,
);

// PATCH /v1/schools/:id/activate
router.patch(
  "/:id/activate",
  authorize(["SUPER_ADMIN"]),
  validate({ params: uuidParamSchema }),
  activateSchoolController,
);

// PATCH /v1/schools/:id/deactivate
router.patch(
  "/:id/deactivate",
  authorize(["SUPER_ADMIN"]),
  validate({ params: uuidParamSchema }),
  deactivateSchoolController,
);

// DELETE /v1/schools/:id
router.delete(
  "/:id",
  authorize(["SUPER_ADMIN"]),
  validate({ params: uuidParamSchema }),
  deleteSchoolController,
);

export default router;
