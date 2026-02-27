import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { SUCCESS_MESSAGES } from "../../config/constants.js";
import {
  listSuperAdmins,
  getSuperAdmin,
  registerSuperAdmin,
  updateSuperAdmin,
  changeSuperAdminPassword,
  deleteSuperAdmin,
} from "./superAdmin.service.js";

//////////////////////////////
//! GET /v1/super-admins
//! List all super admins (paginated)
//////////////////////////////

export const getAllSuperAdminsController = asyncHandler(async (req, res) => {
  // req.parsedQuery has coerced types (booleans, numbers) set by validate middleware
  // req.query has raw strings from the URL — never use it after validation
  const result = await listSuperAdmins(req.parsedQuery);
  return ApiResponse.ok(res, result, "Super admins retrieved successfully");
});

//////////////////////////////
//! GET /v1/super-admins/:id
//! Get a single super admin by ID
//////////////////////////////

export const getSuperAdminByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const admin = await getSuperAdmin(id);
  return ApiResponse.ok(res, admin, "Super admin retrieved successfully");
});

//////////////////////////////
//! POST /v1/super-admins
//! Register a new super admin
//////////////////////////////

export const registerSuperAdminController = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const admin = await registerSuperAdmin({ name, email, password });
  return ApiResponse.created(res, admin, SUCCESS_MESSAGES.CREATED);
});

//////////////////////////////
//! PATCH /v1/super-admins/:id
//! Update name / is_active
//////////////////////////////

export const updateSuperAdminController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const admin = await updateSuperAdmin(id, req.body);
  return ApiResponse.ok(res, admin, SUCCESS_MESSAGES.UPDATED);
});

//////////////////////////////
//! PATCH /v1/super-admins/:id/password
//! Change password (requires current password)
//////////////////////////////

export const changeSuperAdminPasswordController = asyncHandler(
  async (req, res) => {
    const { id } = req.params;
    const result = await changeSuperAdminPassword(id, req.body);
    return ApiResponse.ok(res, result, "Password changed successfully");
  },
);

//////////////////////////////
//! DELETE /v1/super-admins/:id
//! Soft delete — sets is_active = false & revokes sessions
//////////////////////////////

export const deleteSuperAdminController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestingAdminId = req.user.id;
  const admin = await deleteSuperAdmin(id, requestingAdminId);
  return ApiResponse.ok(res, admin, SUCCESS_MESSAGES.DELETED);
});
