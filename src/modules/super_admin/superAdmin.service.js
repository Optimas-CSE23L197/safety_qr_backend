import bcrypt from "bcrypt";
import {
  getAllSuperAdmins,
  getSuperAdminById,
  getSuperAdminByIdWithPassword,
  getSuperAdminByEmail,
  createSuperAdmin,
  updateSuperAdminById,
  updateSuperAdminPassword,
  softDeleteSuperAdminById,
  countActiveSuperAdmins,
} from "./superAdmin.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  PAGINATION,
} from "../../config/constants.js";

const SALT_ROUNDS = 12;

//////////////////////////////
//! List all super admins
//////////////////////////////

export const listSuperAdmins = async (query) => {
  const page = query.page ?? PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(
    query.limit ?? PAGINATION.DEFAULT_LIMIT,
    PAGINATION.MAX_LIMIT,
  );
  const search = query.search ?? undefined;
  const is_active = query.is_active; // boolean | undefined after Zod coercion

  const { admins, total } = await getAllSuperAdmins({
    page,
    limit,
    search,
    is_active,
  });

  return {
    data: admins,
    meta: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

//////////////////////////////
//! Get a single super admin
//////////////////////////////

export const getSuperAdmin = async (adminId) => {
  const admin = await getSuperAdminById(adminId);

  if (!admin) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.ADMIN_NOT_FOUND);
  }

  return admin;
};

//////////////////////////////
//! Register a new super admin
//////////////////////////////

export const registerSuperAdmin = async ({ name, email, password }) => {
  // 1. Check for duplicate email
  const existing = await getSuperAdminByEmail(email);
  if (existing) {
    throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_MESSAGES.EMAIL_ALREADY_USED);
  }

  // 2. Hash password
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // 3. Persist
  const admin = await createSuperAdmin({ name, email, password_hash });

  return admin;
};

//////////////////////////////
//! Update super admin profile (name / is_active)
//////////////////////////////

export const updateSuperAdmin = async (adminId, updateData) => {
  // 1. Ensure target exists
  const existing = await getSuperAdminById(adminId);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.ADMIN_NOT_FOUND);
  }

  // 2. Guard: cannot de-activate the last active super admin
  if (updateData.is_active === false && existing.is_active === true) {
    const activeCount = await countActiveSuperAdmins();
    if (activeCount <= 1) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Cannot deactivate the last active super admin",
      );
    }
  }

  const updated = await updateSuperAdminById(adminId, updateData);

  return updated;
};

//////////////////////////////
//! Change password
//////////////////////////////

export const changeSuperAdminPassword = async (
  adminId,
  { current_password, new_password },
) => {
  // 1. Fetch with hash
  const admin = await getSuperAdminByIdWithPassword(adminId);
  if (!admin) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.ADMIN_NOT_FOUND);
  }

  // 2. Verify account is active
  if (!admin.is_active) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.ACCOUNT_DISABLED);
  }

  // 3. Verify current password
  const isMatch = await bcrypt.compare(current_password, admin.password_hash);
  if (!isMatch) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_CREDENTIALS,
    );
  }

  // 4. Hash new password
  const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

  // 5. Persist
  const result = await updateSuperAdminPassword(adminId, password_hash);

  return result;
};

//////////////////////////////
//! Soft delete super admin
//////////////////////////////

export const deleteSuperAdmin = async (adminId, requestingAdminId) => {
  // 1. Ensure target exists
  const existing = await getSuperAdminById(adminId);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.ADMIN_NOT_FOUND);
  }

  // 2. Prevent self-deletion
  if (adminId === requestingAdminId) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      "You cannot delete your own account",
    );
  }

  // 3. Prevent deleting the last active admin
  if (existing.is_active) {
    const activeCount = await countActiveSuperAdmins();
    if (activeCount <= 1) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "Cannot delete the last active super admin",
      );
    }
  }

  const deleted = await softDeleteSuperAdminById(adminId);

  return deleted;
};
