import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize }    from "../../middlewares/rbac.middleware.js";
import { validate }     from "../../middlewares/validate.middleware.js";
import { ROLES }        from "../../config/constants.js";
import {
  enrollStudentSchema,
  listStudentsSchema,
  studentIdParamSchema,
  updateStudentSchema,
  updateStudentPhotoSchema,
  linkParentSchema,
  parentLinkParamSchema,
  updateParentLinkSchema,
  setLocationConsentSchema,
} from "./student.validation.js";
import {
  enrollStudentController,
  listStudentsController,
  getStudentController,
  updateStudentController,
  updateStudentPhotoController,
  activateStudentController,
  deactivateStudentController,
  deleteStudentController,
  linkParentController,
  listParentsController,
  updateParentLinkController,
  unlinkParentController,
  getLocationConsentController,
  setLocationConsentController,
} from "./student.controller.js";

// ─────────────────────────────────────────────
// Router is mounted at /api/v1/schools/:schoolId/students
// Express mergeParams: true is required so :schoolId is accessible here
// ─────────────────────────────────────────────
const router = Router({ mergeParams: true });

// All student routes require authentication
router.use(authenticate, authorize(ROLES.SUPER_ADMIN));

// ─────────────────────────────────────────────
// Collection  /
// ─────────────────────────────────────────────
router
  .route("/")
  .post(validate(enrollStudentSchema),  enrollStudentController)   // POST  — enroll
  .get( validate(listStudentsSchema),   listStudentsController);    // GET   — paginated list

// ─────────────────────────────────────────────
// Individual student  /:id
// ─────────────────────────────────────────────
router
  .route("/:id")
  .get(    validate(studentIdParamSchema), getStudentController)    // GET    — full profile
  .patch(  validate(updateStudentSchema),  updateStudentController) // PATCH  — update details
  .delete( validate(studentIdParamSchema), deleteStudentController); // DELETE — soft delete

// ─────────────────────────────────────────────
// Photo
// ─────────────────────────────────────────────
router.patch(
  "/:id/photo",
  validate(updateStudentPhotoSchema),
  updateStudentPhotoController,
);

// ─────────────────────────────────────────────
// Status toggles
// ─────────────────────────────────────────────
router.patch("/:id/activate",   validate(studentIdParamSchema), activateStudentController);
router.patch("/:id/deactivate", validate(studentIdParamSchema), deactivateStudentController);

// ─────────────────────────────────────────────
// Parent relationships  /:id/parents
// ─────────────────────────────────────────────
router
  .route("/:id/parents")
  .post(validate(linkParentSchema),    linkParentController)    // POST  — link parent
  .get( validate(studentIdParamSchema), listParentsController); // GET   — list parents

router
  .route("/:id/parents/:parentId")
  .patch(  validate(updateParentLinkSchema), updateParentLinkController)  // PATCH  — update link
  .delete( validate(parentLinkParamSchema),  unlinkParentController);     // DELETE — unlink

// ─────────────────────────────────────────────
// Location consent  /:id/location-consent
// ─────────────────────────────────────────────
router
  .route("/:id/location-consent")
  .get( validate(studentIdParamSchema),   getLocationConsentController) // GET — read status
  .put( validate(setLocationConsentSchema), setLocationConsentController); // PUT — upsert

export default router;