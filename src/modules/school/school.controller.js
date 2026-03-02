import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { SUCCESS_MESSAGES } from "../../config/constants.js";
import {
  listSchools,
  getSchoolById,
  getSchoolByCode,
  registerSchool,
  updateSchool,
  uploadSchoolLogo,
  activateSchoolById,
  deactivateSchoolById,
  deleteSchool,
} from "./school.service.js";

// ---------------------------------------------------------------------------
// GET /v1/schools
// SUPER_ADMIN  → full paginated list
// SCHOOL_ADMIN → req.ownSchoolId set by restrictToOwnSchool → returns only own school
// ---------------------------------------------------------------------------

export const getAllSchoolsController = asyncHandler(async (req, res) => {
  const result = await listSchools(req.parsedQuery, req.ownSchoolId ?? null);
  return ApiResponse.ok(res, result, "Schools retrieved successfully");
});

// ---------------------------------------------------------------------------
// GET /v1/schools/:id
// Ownership already enforced by restrictToOwnSchool before this runs
// ---------------------------------------------------------------------------

export const getSchoolByIdController = asyncHandler(async (req, res) => {
  const school = await getSchoolById(req.params.id);
  return ApiResponse.ok(res, school, "School retrieved successfully");
});

// ---------------------------------------------------------------------------
// GET /v1/schools/code/:code
// SCHOOL_ADMIN: req.ownSchoolId passed → service verifies match
// ---------------------------------------------------------------------------

export const getSchoolByCodeController = asyncHandler(async (req, res) => {
  const school = await getSchoolByCode(
    req.params.code,
    req.ownSchoolId ?? null,
  );
  return ApiResponse.ok(res, school, "School retrieved successfully");
});

// ---------------------------------------------------------------------------
// POST /v1/schools  (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export const createSchoolController = asyncHandler(async (req, res) => {
  const school = await registerSchool(req.body);
  return ApiResponse.created(res, school, SUCCESS_MESSAGES.CREATED);
});

// ---------------------------------------------------------------------------
// PATCH /v1/schools/:id  (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export const updateSchoolController = asyncHandler(async (req, res) => {
  const school = await updateSchool(req.params.id, req.body);
  return ApiResponse.ok(res, school, SUCCESS_MESSAGES.UPDATED);
});

// ---------------------------------------------------------------------------
// PATCH /v1/schools/:id/logo  (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export const uploadSchoolLogoController = asyncHandler(async (req, res) => {
  const school = await uploadSchoolLogo(req.params.id, req.file);
  return ApiResponse.ok(res, school, "Logo updated successfully");
});

// ---------------------------------------------------------------------------
// PATCH /v1/schools/:id/activate  (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export const activateSchoolController = asyncHandler(async (req, res) => {
  const school = await activateSchoolById(req.params.id);
  return ApiResponse.ok(res, school, "School activated successfully");
});

// ---------------------------------------------------------------------------
// PATCH /v1/schools/:id/deactivate  (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export const deactivateSchoolController = asyncHandler(async (req, res) => {
  const school = await deactivateSchoolById(req.params.id);
  return ApiResponse.ok(res, school, "School deactivated successfully");
});

// ---------------------------------------------------------------------------
// DELETE /v1/schools/:id  (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

export const deleteSchoolController = asyncHandler(async (req, res) => {
  const result = await deleteSchool(req.params.id);
  return ApiResponse.ok(res, result, SUCCESS_MESSAGES.DELETED);
});
