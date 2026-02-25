import prisma from "../../config/prisma.js";

// =============================================================================
// Auth Repository — pure DB access, zero business logic
//
// Three actor models:
//   SuperAdmin  → prisma.superAdmin
//   SchoolUser  → prisma.schoolUser
//   ParentUser  → prisma.parentUser
// =============================================================================

// ---------------------------------------------------------------------------
// SuperAdmin
// ---------------------------------------------------------------------------

export const findSuperAdminByEmail = async (email) => {
  return prisma.superAdmin.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password_hash: true,
      name: true,
      is_active: true,
    },
  });
};

export const findSuperAdminById = async (id) => {
  return prisma.superAdmin.findUnique({
    where: { id },
    select: { id: true, is_active: true },
  });
};

export const updateSuperAdminLastLogin = async (id) => {
  return prisma.superAdmin.update({
    where: { id },
    data: { last_login_at: new Date() },
  });
};

// ---------------------------------------------------------------------------
// SchoolUser
// ---------------------------------------------------------------------------

export const findSchoolUserByEmail = async (email) => {
  return prisma.schoolUser.findUnique({
    where: { email },
    select: {
      id: true,
      school_id: true,
      email: true,
      password_hash: true,
      name: true,
      role: true,
      is_active: true,
    },
  });
};

export const findSchoolUserById = async (id) => {
  return prisma.schoolUser.findUnique({
    where: { id },
    select: { id: true, school_id: true, role: true, is_active: true },
  });
};

export const updateSchoolUserLastLogin = async (id) => {
  return prisma.schoolUser.update({
    where: { id },
    data: { last_login_at: new Date() },
  });
};

// ---------------------------------------------------------------------------
// ParentUser
// Phone is encrypted in DB — never query by raw phone value.
// Always use phone_index (HMAC blind index of normalized phone).
// ---------------------------------------------------------------------------

export const findParentByPhoneIndex = async (phoneIndex) => {
  return prisma.parentUser.findUnique({
    where: { phone_index: phoneIndex },
    select: {
      id: true,
      phone: true, // [ENCRYPTED] — decrypt in service if needed
      phone_index: true,
      is_phone_verified: true,
      status: true,
    },
  });
};

export const findParentById = async (id) => {
  return prisma.parentUser.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
};

export const createParentUser = async ({ encryptedPhone, phoneIndex }) => {
  return prisma.parentUser.create({
    data: {
      phone: encryptedPhone,
      phone_index: phoneIndex,
      is_phone_verified: true,
      status: "ACTIVE",
    },
    select: { id: true, status: true },
  });
};

export const updateParentLastLogin = async (id) => {
  return prisma.parentUser.update({
    where: { id },
    data: { last_login_at: new Date() },
  });
};

// ---------------------------------------------------------------------------
// Sessions
// Refresh tokens stored as SHA-256 hashes — never raw strings.
// Rotated on every use: old session deleted, new session created.
// ---------------------------------------------------------------------------

export const createSession = async ({
  superAdminId,
  schoolUserId,
  parentUserId,
  refreshTokenHash,
  deviceInfo,
  ipAddress,
  expiresAt,
}) => {
  return prisma.session.create({
    data: {
      admin_user_id: superAdminId ?? null,
      school_user_id: schoolUserId ?? null,
      parent_user_id: parentUserId ?? null,
      refresh_token_hash: refreshTokenHash,
      device_info: deviceInfo ?? null,
      ip_address: ipAddress ?? null,
      expires_at: expiresAt,
    },
    select: { id: true },
  });
};

export const findSessionByRefreshHash = async (hash) => {
  return prisma.session.findUnique({
    where: { refresh_token_hash: hash },
    select: {
      id: true,
      admin_user_id: true,
      school_user_id: true,
      parent_user_id: true,
      expires_at: true,
    },
  });
};

export const deleteSession = async (id) => {
  return prisma.session.delete({ where: { id } });
};

// ---------------------------------------------------------------------------
// JWT Blacklist
// Access tokens blacklisted on logout — stored as SHA-256 hash only.
// ---------------------------------------------------------------------------

export const addToBlacklist = async (tokenHash, expiresAt) => {
  return prisma.blacklistToken.create({
    data: { token_hash: tokenHash, expires_at: expiresAt },
  });
};
