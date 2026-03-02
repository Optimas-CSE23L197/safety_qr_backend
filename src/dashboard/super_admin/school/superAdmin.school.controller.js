import { asyncHandler } from "../../../utils/asyncHandler.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import {
  registerSchool,
  listSchools,
  getSchoolById,
  activateSchool,
  deactivateSchool,
} from "./superAdmin.school.service.js";

// ---------------------------------------------------------------------------
// POST /v1/super-admin/schools/register
// Body validated by registerSchoolValidation middleware before reaching here
// ---------------------------------------------------------------------------

export const registerSchoolController = asyncHandler(async (req, res) => {
  const { school, admin, subscription } = req.body;

  const result = await registerSchool({ school, admin, subscription });

  return ApiResponse.created(
    res,
    result,
    `School "${result.school.name}" registered successfully`,
  );
});

// ---------------------------------------------------------------------------
// GET /v1/super-admin/schools
// Query params validated by listSchoolsQueryValidation middleware
// ---------------------------------------------------------------------------

export const getAllSchoolsController = asyncHandler(async (req, res) => {
  const result = await listSchools(req.parsedQuery ?? req.query);

  return ApiResponse.ok(res, result, "Schools retrieved successfully");
});

// ---------------------------------------------------------------------------
// GET /v1/super-admin/schools/:id
// ---------------------------------------------------------------------------

export const getSchoolByIdController = asyncHandler(async (req, res) => {
  const school = await getSchoolById(req.params.id);

  return ApiResponse.ok(res, school, "School retrieved successfully");
});

// ---------------------------------------------------------------------------
// PATCH /v1/super-admin/schools/:id/activate
// ---------------------------------------------------------------------------

export const activateSchoolController = asyncHandler(async (req, res) => {
  const school = await activateSchool(req.params.id);

  return ApiResponse.ok(res, school, "School activated successfully");
});

// ---------------------------------------------------------------------------
// PATCH /v1/super-admin/schools/:id/deactivate
// ---------------------------------------------------------------------------

export const deactivateSchoolController = asyncHandler(async (req, res) => {
  const school = await deactivateSchool(req.params.id);

  return ApiResponse.ok(
    res,
    school,
    "School deactivated — all active sessions revoked",
  );
});
