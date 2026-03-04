import prisma from "../../config/prisma.js";

export const findSchoolById = async (schoolId) => {
  return await prisma.school.findUnique({
    where: { id: schoolId },
    include: { settings: true },
  });
};

// ---------------------------------------------------------------------------
// Field selection — returned on every public query
// Includes settings relation for full school profile
// ---------------------------------------------------------------------------

const schoolFields = {
  id: true,
  name: true,
  code: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  country: true,
  timezone: true,
  logo_url: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  settings: {
    select: {
      allow_location: true,
      allow_parent_edit: true,
      scan_notifications_enabled: true,
      notify_on_every_scan: true,
      scan_alert_cooldown_mins: true,
      token_validity_months: true,
      max_tokens_per_student: true,
      default_profile_visibility: true,
    },
  },
};

// Lightweight fields for list view (no settings relation — avoids N+1)
const schoolListFields = {
  id: true,
  name: true,
  code: true,
  email: true,
  phone: true,
  city: true,
  country: true,
  logo_url: true,
  is_active: true,
  created_at: true,
  updated_at: true,
};

// ---------------------------------------------------------------------------
// List schools (paginated, filterable, sortable)
// ---------------------------------------------------------------------------

export const findAllSchools = async ({
  page,
  limit,
  search,
  country,
  is_active,
  sortBy,
  sortOrder,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(typeof is_active === "boolean" && { is_active }),
    ...(country && { country }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [schools, total] = await prisma.$transaction([
    prisma.school.findMany({
      where,
      select: schoolListFields,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
    prisma.school.count({ where }),
  ]);

  return { schools, total };
};

// ---------------------------------------------------------------------------
// Get single school by ID (full profile with settings)
// ---------------------------------------------------------------------------

export const findSchoolBy_Id = async (id) => {
  return prisma.school.findUnique({
    where: { id },
    select: schoolFields,
  });
};

// ---------------------------------------------------------------------------
// Get school by unique code
// ---------------------------------------------------------------------------

export const findSchoolByCode = async (code) => {
  return prisma.school.findUnique({
    where: { code },
    select: schoolFields,
  });
};

// ---------------------------------------------------------------------------
// Check if code is already taken (for uniqueness validation)
// ---------------------------------------------------------------------------

export const findSchoolByCodeRaw = async (code) => {
  return prisma.school.findUnique({
    where: { code },
    select: { id: true, code: true },
  });
};

// ---------------------------------------------------------------------------
// Create school + default settings in a single transaction
// ---------------------------------------------------------------------------

export const createSchool = async ({
  name,
  code,
  email,
  phone,
  address,
  city,
  country,
  timezone,
}) => {
  return prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name,
        code,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        country: country ?? "IN",
        timezone: timezone ?? "Asia/Kolkata",
        // Auto-create default settings on school creation
        settings: {
          create: {},
        },
      },
      select: schoolFields,
    });

    return school;
  });
};

// ---------------------------------------------------------------------------
// Update school details (PATCH — partial)
// ---------------------------------------------------------------------------

export const updateSchoolById = async (id, data) => {
  return prisma.school.update({
    where: { id },
    data,
    select: schoolFields,
  });
};

// ---------------------------------------------------------------------------
// Update logo URL
// ---------------------------------------------------------------------------

export const updateSchoolLogo = async (id, logo_url) => {
  return prisma.school.update({
    where: { id },
    data: { logo_url },
    select: {
      id: true,
      name: true,
      logo_url: true,
      updated_at: true,
    },
  });
};

// ---------------------------------------------------------------------------
// Activate school
// ---------------------------------------------------------------------------

export const activateSchool = async (id) => {
  return prisma.school.update({
    where: { id },
    data: { is_active: true },
    select: schoolFields,
  });
};

// ---------------------------------------------------------------------------
// Deactivate school (soft delete)
// Cascades: revoke all school user sessions immediately
// ---------------------------------------------------------------------------

export const deactivateSchool = async (id) => {
  const [school] = await prisma.$transaction([
    prisma.school.update({
      where: { id },
      data: { is_active: false },
      select: schoolFields,
    }),
    // Revoke all active sessions for users belonging to this school
    prisma.session.deleteMany({
      where: {
        schoolUser: { school_id: id },
      },
    }),
  ]);

  return school;
};

// ---------------------------------------------------------------------------
// Hard delete school (cascades to all related records via Prisma onDelete)
// ---------------------------------------------------------------------------

export const hardDeleteSchool = async (id) => {
  return prisma.school.delete({
    where: { id },
    select: { id: true, name: true, code: true },
  });
};

// ---------------------------------------------------------------------------
// Count helpers
// ---------------------------------------------------------------------------

export const countSchoolStudents = async (id) => {
  return prisma.student.count({ where: { school_id: id, deleted_at: null } });
};

export const countSchoolUsers = async (id) => {
  return prisma.schoolUser.count({ where: { school_id: id, is_active: true } });
};
