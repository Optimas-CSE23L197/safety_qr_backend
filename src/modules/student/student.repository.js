import prisma from "../../config/prisma.js";

// ─────────────────────────────────────────────
// Student queries
// ─────────────────────────────────────────────

/**
 * Full student profile — joins everything the API exposes
 * Excludes soft-deleted records by default
 */
export const findStudentById = (id, schoolId) =>
  prisma.student.findFirst({
    where: {
      id,
      school_id: schoolId,
      deleted_at: null, // never surface archived students
    },
    include: {
      parents: {
        include: {
          parent: {
            select: {
              id: true,
              email: true,
              phone: true,
              is_phone_verified: true,
              is_email_verified: true,
              status: true,
              last_login_at: true,
            },
          },
        },
      },
      emergency: {
        include: { contacts: true },
      },
      locationConsent: true,
      tokens: {
        where: { status: { not: "REVOKED" } },
        select: { id: true, status: true, expires_at: true, activated_at: true },
      },
    },
  });

/**
 * Lightweight row — used for existence checks, guards, and update diff
 */
export const findStudentRaw = (id, schoolId) =>
  prisma.student.findFirst({
    where: { id, school_id: schoolId, deleted_at: null },
  });

/**
 * Paginated list — scoped to a school, supports class/section/status/search filters
 */
export const findAllStudents = ({
  schoolId,
  skip,
  take,
  search,
  studentClass,
  section,
  is_active,
  sortBy = "first_name",
  sortOrder = "asc",
}) => {
  const where = {
    school_id: schoolId,
    deleted_at: null,
    ...(typeof is_active === "boolean" && { is_active }),
    ...(studentClass && { class: studentClass }),
    ...(section && { section }),
    ...(search && {
      OR: [
        { first_name: { contains: search, mode: "insensitive" } },
        { last_name:  { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  return prisma.$transaction([
    prisma.student.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        class: true,
        section: true,
        photo_url: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        // omit dob_encrypted, deleted_at from list view
      },
    }),
    prisma.student.count({ where }),
  ]);
};

/**
 * Create a new student record
 */
export const createStudent = (data) =>
  prisma.student.create({ data });

/**
 * Update student fields — returns updated row
 */
export const updateStudentById = (id, schoolId, data) =>
  prisma.student.update({
    where: { id },
    data,
  });

/**
 * Update only photo_url
 */
export const updateStudentPhoto = (id, photo_url) =>
  prisma.student.update({
    where: { id },
    data: { photo_url },
    select: { id: true, photo_url: true, updated_at: true },
  });

/**
 * Soft delete — sets deleted_at timestamp, never destroys the row
 */
export const softDeleteStudent = (id) =>
  prisma.student.update({
    where: { id },
    data: { deleted_at: new Date(), is_active: false },
    select: { id: true, deleted_at: true },
  });

// ─────────────────────────────────────────────
// Parent ↔ Student relationship queries
// ─────────────────────────────────────────────

/**
 * Find a specific parent-student link
 */
export const findParentStudentLink = (studentId, parentId) =>
  prisma.parentStudent.findUnique({
    where: { parent_id_student_id: { parent_id: parentId, student_id: studentId } },
  });

/**
 * List all parents linked to a student
 */
export const findParentsByStudent = (studentId) =>
  prisma.parentStudent.findMany({
    where: { student_id: studentId },
    include: {
      parent: {
        select: {
          id: true,
          email: true,
          phone: true,
          status: true,
          is_phone_verified: true,
          is_email_verified: true,
          last_login_at: true,
        },
      },
    },
    orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
  });

/**
 * Check if a parent already exists in the system
 */
export const findParentById = (parentId) =>
  prisma.parentUser.findUnique({ where: { id: parentId } });

/**
 * Link a parent to a student
 * If is_primary is true, first demote any existing primary link in a transaction
 */
export const linkParentToStudent = async (studentId, parentId, relationship, isPrimary) => {
  return prisma.$transaction(async (tx) => {
    // Demote existing primary before assigning a new one
    if (isPrimary) {
      await tx.parentStudent.updateMany({
        where: { student_id: studentId, is_primary: true },
        data: { is_primary: false },
      });
    }

    return tx.parentStudent.create({
      data: {
        student_id: studentId,
        parent_id: parentId,
        relationship: relationship ?? null,
        is_primary: isPrimary ?? false,
      },
      include: {
        parent: {
          select: { id: true, email: true, phone: true },
        },
      },
    });
  });
};

/**
 * Update an existing parent-student link (relationship label, is_primary flag)
 */
export const updateParentStudentLink = async (studentId, parentId, data) => {
  return prisma.$transaction(async (tx) => {
    if (data.is_primary === true) {
      await tx.parentStudent.updateMany({
        where: { student_id: studentId, is_primary: true },
        data: { is_primary: false },
      });
    }

    return tx.parentStudent.update({
      where: { parent_id_student_id: { parent_id: parentId, student_id: studentId } },
      data,
      include: {
        parent: { select: { id: true, email: true, phone: true } },
      },
    });
  });
};

/**
 * Unlink a parent from a student (hard delete of the join row — not the parent account)
 */
export const unlinkParent = (studentId, parentId) =>
  prisma.parentStudent.delete({
    where: { parent_id_student_id: { parent_id: parentId, student_id: studentId } },
  });

/**
 * Count links — guards against orphaning a student with no parents
 */
export const countParentLinks = (studentId) =>
  prisma.parentStudent.count({ where: { student_id: studentId } });

// ─────────────────────────────────────────────
// Location consent queries
// ─────────────────────────────────────────────

export const findLocationConsent = (studentId) =>
  prisma.locationConsent.findUnique({ where: { student_id: studentId } });

/**
 * Upsert consent record — creates if absent, updates if present
 */
export const upsertLocationConsent = (studentId, enabled, consentedBy) =>
  prisma.locationConsent.upsert({
    where: { student_id: studentId },
    create: { student_id: studentId, enabled, consented_by: consentedBy ?? null },
    update: { enabled, consented_by: consentedBy ?? null },
  });