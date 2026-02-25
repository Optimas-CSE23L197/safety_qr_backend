import bcrypt from "bcrypt";
import * as adminRepo from "./admin.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import { HTTP_STATUS, ERROR_MESSAGES, ROLES } from "../../config/constants.js";

const SALT_ROUNDS = Number(process.env.SALT_ROUNDS);

const sanitizeAdmin = (admin) => {
  const { password, ...safeAdmin } = admin;
  return safeAdmin;
};

//! REGISTER
export const adminRegistration = async (data, creator) => {
  const normalizedEmail = data.email.trim().toLowerCase();

  const existing = await adminRepo.findAdminByEmail(normalizedEmail);
  if (existing)
    throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_MESSAGES.ADMIN_EXISTS);

  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  const adminPayload = {
    name: data.name,
    email: normalizedEmail,
    password: hashedPassword,
    role: data.role,
  };

  const logPayload = {
    adminId: creator.id,
    action: "ADMIN_CREATED",
    entity: "ADMIN",
    metadata: { email: normalizedEmail, role: data.role },
  };

  const admin = await adminRepo.createAdminWithLog(adminPayload, logPayload);
  return sanitizeAdmin(admin);
};

//! UPDATE
export const adminUpdate = async (adminId, data, updater) => {
  const existing = await adminRepo.findAdminById(adminId);
  if (!existing)
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.ADMIN_NOT_FOUND);
  if (!existing.is_active)
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.ADMIN_INACTIVE);

  if (data.role === ROLES.SUPER_ADMIN && updater.role !== ROLES.SUPER_ADMIN) {
    throw new ApiError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
    );
  }

  let normalizedEmail;
  if (data.email) {
    normalizedEmail = data.email.trim().toLowerCase();
    const owner = await adminRepo.findAdminByEmail(normalizedEmail);
    if (owner && owner.id !== adminId) {
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        ERROR_MESSAGES.EMAIL_ALREADY_USED,
      );
    }
  }

  let hashedPassword;
  if (data.password)
    hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  const updatePayload = {
    ...(data.name && { name: data.name }),
    ...(normalizedEmail && { email: normalizedEmail }),
    ...(hashedPassword && { password: hashedPassword }),
    ...(data.role && { role: data.role }),
  };

  const logPayload = {
    adminId: updater.id,
    action: "ADMIN_UPDATED",
    entity: "ADMIN",
    metadata: {
      updatedFields: Object.keys(updatePayload),
      targetAdminId: adminId,
    },
  };

  const admin = await adminRepo.updateAdminWithLog(
    adminId,
    updatePayload,
    logPayload,
  );
  return sanitizeAdmin(admin);
};

//! DELETE (soft)
export const adminDelete = async (adminId, deleter) => {
  const existing = await adminRepo.findAdminById(adminId);
  if (!existing)
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.ADMIN_NOT_FOUND);
  if (!existing.is_active)
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_MESSAGES.ADMIN_INACTIVE);

  if (existing.role === ROLES.SUPER_ADMIN) {
    throw new ApiError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.CANNOT_DELETE_SUPER_ADMIN,
    );
  }

  if (existing.id === deleter.id) {
    throw new ApiError(
      HTTP_STATUS.FORBIDDEN,
      ERROR_MESSAGES.CANNOT_DELETE_SELF,
    );
  }

  const logPayload = {
    adminId: deleter.id,
    action: "ADMIN_DELETED",
    entity: "ADMIN",
    metadata: { targetAdminId: adminId, email: existing.email },
  };

  const admin = await adminRepo.softDeleteAdminWithLog(adminId, logPayload);
  return sanitizeAdmin(admin);
};
