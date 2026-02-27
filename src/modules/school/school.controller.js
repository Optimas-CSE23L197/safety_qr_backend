import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { extractIp } from "../../utils/extractIp.js";
import { SUCCESS_MESSAGES } from "../../config/constants.js";
import {
  createSchoolService,
  listSchoolsService,
  getSchoolByIdService,
  getSchoolByCodeService,
  updateSchoolService,
  updateSchoolLogoService,
  activateSchoolService,
  deactivateSchoolService,
  deleteSchoolService,
} from "./school.service.js";

// ─────────────────────────────────────────────
// POST /api/v1/schools
// ─────────────────────────────────────────────
export const createSchoolController = asyncHandler(async (req, res) => {
  const school = await createSchoolService(req.body, req.admin.id, extractIp(req));
  return ApiResponse.created(res, school, SUCCESS_MESSAGES.CREATED);
});

// ─────────────────────────────────────────────
// GET /api/v1/schools
// ─────────────────────────────────────────────
export const listSchoolsController = asyncHandler(async (req, res) => {
  const result = await listSchoolsService(req.query);
  return ApiResponse.ok(res, result);
});

// ─────────────────────────────────────────────
// GET /api/v1/schools/:id
// ─────────────────────────────────────────────
export const getSchoolController = asyncHandler(async (req, res) => {
  const school = await getSchoolByIdService(req.params.id);
  return ApiResponse.ok(res, school);
});

// ─────────────────────────────────────────────
// GET /api/v1/schools/code/:code
// ─────────────────────────────────────────────
export const getSchoolByCodeController = asyncHandler(async (req, res) => {
  const school = await getSchoolByCodeService(req.params.code);
  return ApiResponse.ok(res, school);
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:id
// ─────────────────────────────────────────────
export const updateSchoolController = asyncHandler(async (req, res) => {
  const school = await updateSchoolService(
    req.params.id,
    req.body,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, school, SUCCESS_MESSAGES.UPDATED);
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:id/logo
// Expects req.body.logo_url (pre-signed S3 URL after upload) or
// integrate your multer/cloudinary middleware before this handler
// ─────────────────────────────────────────────
export const updateSchoolLogoController = asyncHandler(async (req, res) => {
  const school = await updateSchoolLogoService(
    req.params.id,
    req.body.logo_url,
    req.admin.id,
    extractIp(req),
  );
  return ApiResponse.ok(res, school, "Logo updated successfully");
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:id/activate
// ─────────────────────────────────────────────
export const activateSchoolController = asyncHandler(async (req, res) => {
  const school = await activateSchoolService(req.params.id, req.admin.id, extractIp(req));
  return ApiResponse.ok(res, school, "School activated successfully");
});

// ─────────────────────────────────────────────
// PATCH /api/v1/schools/:id/deactivate
// ─────────────────────────────────────────────
export const deactivateSchoolController = asyncHandler(async (req, res) => {
  const school = await deactivateSchoolService(req.params.id, req.admin.id, extractIp(req));
  return ApiResponse.ok(res, school, "School deactivated successfully");
});

// ─────────────────────────────────────────────
// DELETE /api/v1/schools/:id   (SUPER_ADMIN only — hard delete)
// ─────────────────────────────────────────────
export const deleteSchoolController = asyncHandler(async (req, res) => {
  await deleteSchoolService(req.params.id, req.admin.id, extractIp(req));
  return res.status(204).send();
});