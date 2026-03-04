import prisma from "../../config/prisma.js";

//////////////////////////////
//! Shared field exclusion — never expose password_hash
//////////////////////////////

const safeFields = {
  id: true,
  name: true,
  email: true,
  is_active: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
};

//////////////////////////////
//! Get all super admins (paginated + filterable)
//////////////////////////////

export const getAllSuperAdmins = async ({ page, limit, search, is_active }) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(typeof is_active === "boolean" && { is_active }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [admins, total] = await prisma.$transaction([
    prisma.superAdmin.findMany({
      where,
      select: safeFields,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.superAdmin.count({ where }),
  ]);

  return { admins, total };
};

//////////////////////////////
//! Get super admin by ID (safe)
//////////////////////////////

export const getSuperAdminById = async (adminId) => {
  return prisma.superAdmin.findUnique({
    where: { id: adminId },
    select: safeFields,
  });
};

//////////////////////////////
//! Get super admin by ID with password_hash (for auth checks)
//////////////////////////////

export const getSuperAdminByIdWithPassword = async (adminId) => {
  return prisma.superAdmin.findUnique({
    where: { id: adminId },
  });
};

//////////////////////////////
//! Get super admin by email (for uniqueness / auth checks)
//////////////////////////////

export const getSuperAdminByEmail = async (email) => {
  return prisma.superAdmin.findUnique({
    where: { email },
  });
};

//////////////////////////////
//! Create super admin
//////////////////////////////

export const createSuperAdmin = async ({ name, email, password_hash }) => {
  return prisma.superAdmin.create({
    data: { name, email, password_hash },
    select: safeFields,
  });
};

//////////////////////////////
//! Update super admin by ID (PATCH — partial update)
//////////////////////////////

export const updateSuperAdminById = async (adminId, updateData) => {
  return prisma.superAdmin.update({
    where: { id: adminId },
    data: updateData,
    select: safeFields,
  });
};

//////////////////////////////
//! Change password — update password_hash only
//////////////////////////////

export const updateSuperAdminPassword = async (adminId, password_hash) => {
  return prisma.superAdmin.update({
    where: { id: adminId },
    data: { password_hash },
    select: { id: true, email: true, updated_at: true },
  });
};

//////////////////////////////
//! Soft delete — set is_active = false
//! Also invalidates all sessions for this admin
//////////////////////////////

export const softDeleteSuperAdminById = async (adminId) => {
  const [updated] = await prisma.$transaction([
    prisma.superAdmin.update({
      where: { id: adminId },
      data: { is_active: false },
      select: safeFields,
    }),
    // Revoke all active sessions immediately
    prisma.session.deleteMany({
      where: { admin_user_id: adminId },
    }),
  ]);

  return updated;
};

//////////////////////////////
//! Check if any other super admin exists (prevent last-admin deletion)
//////////////////////////////

export const countActiveSuperAdmins = async () => {
  return prisma.superAdmin.count({ where: { is_active: true } });
};
