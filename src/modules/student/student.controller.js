import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse }   from "../../utils/ApiResponse.js";
import { extractIp }     from "../../utils/extractIp.js";
import { SUCCESS_MESSAGES } from "../../config/constants.js";
import {
  enrollStudentService,
  listStudentsService,
  getStudentService,
  updateStudentService,
  updateStudentPhotoService,
  setStudentActiveStatusService,
  deleteStudentService,
  linkParentService,
  listParentsService,
  updateParentLinkService,
  unlinkParentService,
  getLocationConsentService,
  setLocationConsentService,
} from "./student.service.js";

// ─────────────────────────────────────────────
// POST /api/v1/schools/:schoolId/students
// ─────────────────────────────────────────────
export const enrollStudentController = asyncHandler(async (req, res) => {
  const student = await enrollStudentService(
    req.params.schoolId,
    req.body,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.created(res, student, SUCCESS_MESSAGES.CREATED);
});

// ─────────────────────────────────────────────
// GET /api/v1/schools/:schoolId/students
// ─────────────────────────────────────────────
export const listStudentsController = asyncHandler(async (req, res) => {
  const result = await listStudentsService(req.params.schoolId, req.query);
  return ApiResponse.ok(res, result);
});

// ─────────────────────────────────────────────
// GET /api/v1/schools/:schoolId/students/:id
// ─────────────────────────────────────────────
export const getStudentController = asyncHandler(async (req, res) => {
  const student = await getStudentService(req.params.id, req.params.schoolId);
  return ApiResponse.ok(res, student);
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:schoolId/students/:id
// ─────────────────────────────────────────────
export const updateStudentController = asyncHandler(async (req, res) => {
  const student = await updateStudentService(
    req.params.id,
    req.params.schoolId,
    req.body,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, student, SUCCESS_MESSAGES.UPDATED);
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:schoolId/students/:id/photo
// ─────────────────────────────────────────────
export const updateStudentPhotoController = asyncHandler(async (req, res) => {
  const student = await updateStudentPhotoService(
    req.params.id,
    req.params.schoolId,
    req.body.photo_url,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, student, "Photo updated successfully");
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:schoolId/students/:id/activate
// ─────────────────────────────────────────────
export const activateStudentController = asyncHandler(async (req, res) => {
  const student = await setStudentActiveStatusService(
    req.params.id,
    req.params.schoolId,
    true,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, student, "Student activated successfully");
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:schoolId/students/:id/deactivate
// ─────────────────────────────────────────────
export const deactivateStudentController = asyncHandler(async (req, res) => {
  const student = await setStudentActiveStatusService(
    req.params.id,
    req.params.schoolId,
    false,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, student, "Student deactivated successfully");
});

// ─────────────────────────────────────────────
// DELETE /api/v1/schools/:schoolId/students/:id  (soft delete)
// ─────────────────────────────────────────────
export const deleteStudentController = asyncHandler(async (req, res) => {
  await deleteStudentService(
    req.params.id,
    req.params.schoolId,
    req.admin.id,
    extractIp(req),
  );
  return res.status(204).send();
});

// ─────────────────────────────────────────────
// POST /api/v1/schools/:schoolId/students/:id/parents
// ─────────────────────────────────────────────
export const linkParentController = asyncHandler(async (req, res) => {
  const link = await linkParentService(
    req.params.id,
    req.params.schoolId,
    req.body,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.created(res, link, "Parent linked successfully");
});

// ─────────────────────────────────────────────
// GET /api/v1/schools/:schoolId/students/:id/parents
// ─────────────────────────────────────────────
export const listParentsController = asyncHandler(async (req, res) => {
  const parents = await listParentsService(req.params.id, req.params.schoolId);
  return ApiResponse.ok(res, parents);
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:schoolId/students/:id/parents/:parentId
// ─────────────────────────────────────────────
export const updateParentLinkController = asyncHandler(async (req, res) => {
  const link = await updateParentLinkService(
    req.params.id,
    req.params.schoolId,
    req.params.parentId,
    req.body,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, link, SUCCESS_MESSAGES.UPDATED);
});

// ─────────────────────────────────────────────
// DELETE /api/v1/schools/:schoolId/students/:id/parents/:parentId
// ─────────────────────────────────────────────
export const unlinkParentController = asyncHandler(async (req, res) => {
  await unlinkParentService(
    req.params.id,
    req.params.schoolId,
    req.params.parentId,
    req.admin.id,
    extractIp(req),
  );
  return res.status(204).send();
});

// ─────────────────────────────────────────────
// GET /api/v1/schools/:schoolId/students/:id/location-consent
// ─────────────────────────────────────────────
export const getLocationConsentController = asyncHandler(async (req, res) => {
  const consent = await getLocationConsentService(req.params.id, req.params.schoolId);
  return ApiResponse.ok(res, consent);
});

// ─────────────────────────────────────────────
// PUT /api/v1/schools/:schoolId/students/:id/location-consent
// ─────────────────────────────────────────────
export const setLocationConsentController = asyncHandler(async (req, res) => {
  const consent = await setLocationConsentService(
    req.params.id,
    req.params.schoolId,
    req.body,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, consent, "Location consent updated");
});