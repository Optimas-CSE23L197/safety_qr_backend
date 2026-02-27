import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/rbac.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { ROLES } from "../../config/constants.js";
import {
  createSchoolSchema,
  updateSchoolSchema,
  updateSchoolLogoSchema,
  schoolIdParamSchema,
  schoolCodeParamSchema,
  listSchoolsSchema,
} from "./school.validation.js";
import {
  createSchoolController,
  listSchoolsController,
  getSchoolController,
  getSchoolByCodeController,
  updateSchoolController,
  updateSchoolLogoController,
  activateSchoolController,
  deactivateSchoolController,
  deleteSchoolController,
} from "./school.controller.js";

const router = Router();

// All school management routes are restricted to SUPER_ADMIN
router.use(authenticate, authorize(ROLES.SUPER_ADMIN));

// ─────────────────────────────────────────────
// NOTE: Static path /code/:code MUST be declared before /:id
// to prevent Express matching "code" as a UUID param
// ─────────────────────────────────────────────

// GET /api/v1/schools/code/:code
router.get(
  "/code/:code",
  validate(schoolCodeParamSchema),
  getSchoolByCodeController,
);

// ─────────────────────────────────────────────
// Collection routes
// ─────────────────────────────────────────────

router
  .route("/")
  .post(validate(createSchoolSchema), createSchoolController)   // POST  /api/v1/schools
  .get(validate(listSchoolsSchema), listSchoolsController);      // GET   /api/v1/schools

// ─────────────────────────────────────────────
// Individual school routes
// ─────────────────────────────────────────────

router
  .route("/:id")
  .get(validate(schoolIdParamSchema), getSchoolController)        // GET    /api/v1/schools/:id
  .patch(validate(updateSchoolSchema), updateSchoolController)    // PATCH  /api/v1/schools/:id
  .delete(validate(schoolIdParamSchema), deleteSchoolController); // DELETE /api/v1/schools/:id

// ─────────────────────────────────────────────
// Sub-resource / action routes
// ─────────────────────────────────────────────

router.patch(
  "/:id/logo",
  validate(updateSchoolLogoSchema),
  updateSchoolLogoController,
); // PATCH /api/v1/schools/:id/logo

router.patch(
  "/:id/activate",
  validate(schoolIdParamSchema),
  activateSchoolController,
); // PATCH /api/v1/schools/:id/activate

router.patch(
  "/:id/deactivate",
  validate(schoolIdParamSchema),
  deactivateSchoolController,
); // PATCH /api/v1/schools/:id/deactivate

export default router;