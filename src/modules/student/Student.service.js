import { auditLog }   from "../../utils/auditLogger.js";
import { paginate }   from "../../utils/paginate.js";
import { ApiError }   from "../../utils/ApiError.js";
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  AUDIT_ACTIONS,
  PAGINATION,
} from "../../config/constants.js";
import {
  findStudentById,
  findStudentRaw,
  findAllStudents,
  createStudent,
  updateStudentById,
  updateStudentPhoto,
  softDeleteStudent,
  findParentById,
  findParentStudentLink,
  findParentsByStudent,
  linkParentToStudent,
  updateParentStudentLink,
  unlinkParent,
  countParentLinks,
  findLocationConsent,
  upsertLocationConsent,
} from "./student.repository.js";

// ─────────────────────────────────────────────
// Enroll student
// ─────────────────────────────────────────────

export const enrollStudentService = async (schoolId, body, actorId, ipAddress) => {
  const student = await createStudent({ ...body, school_id: schoolId });

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.CREATE_STUDENT,
    entity:   "Student",
    entityId: student.id,
    newValue: {
      first_name: student.first_name,
      last_name:  student.last_name,
      class:      student.class,
      section:    student.section,
    },
    ipAddress,
  });

  return student;
};

// ─────────────────────────────────────────────
// List students (paginated + filtered)
// ─────────────────────────────────────────────

export const listStudentsService = async (schoolId, query) => {
  const page  = parseInt(query.page)  || PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(
    parseInt(query.limit) || PAGINATION.DEFAULT_LIMIT,
    PAGINATION.MAX_LIMIT,
  );
  const skip = (page - 1) * limit;

  const is_active =
    query.is_active === "true"  ? true  :
    query.is_active === "false" ? false : undefined;

  const [students, total] = await findAllStudents({
    schoolId,
    skip,
    take:         limit,
    search:       query.search,
    studentClass: query.class,
    section:      query.section,
    is_active,
    sortBy:    query.sortBy    || "first_name",
    sortOrder: query.sortOrder === "desc" ? "desc" : "asc",
  });

  return paginate(students, total, page, limit);
};

// ─────────────────────────────────────────────
// Get full student profile
// ─────────────────────────────────────────────

export const getStudentService = async (id, schoolId) => {
  const student = await findStudentById(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }
  return student;
};

// ─────────────────────────────────────────────
// Update student details
// ─────────────────────────────────────────────

export const updateStudentService = async (id, schoolId, body, actorId, ipAddress) => {
  const existing = await findStudentRaw(id, schoolId);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  const updated = await updateStudentById(id, schoolId, body);

  // Build diff — only log fields that actually changed
  const oldValue = {};
  const newValue = {};
  for (const key of Object.keys(body)) {
    if (String(existing[key]) !== String(updated[key])) {
      oldValue[key] = existing[key];
      newValue[key] = updated[key];
    }
  }

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue,
    newValue,
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Update student photo
// ─────────────────────────────────────────────

export const updateStudentPhotoService = async (id, schoolId, photo_url, actorId, ipAddress) => {
  const existing = await findStudentRaw(id, schoolId);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  const updated = await updateStudentPhoto(id, photo_url);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue: { photo_url: existing.photo_url },
    newValue: { photo_url: updated.photo_url },
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Activate / deactivate student
// ─────────────────────────────────────────────

export const setStudentActiveStatusService = async (
  id, schoolId, is_active, actorId, ipAddress,
) => {
  const existing = await findStudentRaw(id, schoolId);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  if (existing.is_active === is_active) {
    const status = is_active ? "already active" : "already inactive";
    throw new ApiError(HTTP_STATUS.CONFLICT, `Student is ${status}`);
  }

  const updated = await updateStudentById(id, schoolId, { is_active });

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue: { is_active: existing.is_active },
    newValue: { is_active: updated.is_active },
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Soft delete (archive) student
// ─────────────────────────────────────────────

export const deleteStudentService = async (id, schoolId, actorId, ipAddress) => {
  const existing = await findStudentRaw(id, schoolId);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  const deleted = await softDeleteStudent(id);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue: { is_active: existing.is_active, deleted_at: null },
    newValue: { is_active: false, deleted_at: deleted.deleted_at },
    ipAddress,
  });
};

// ─────────────────────────────────────────────
// Link parent to student
// ─────────────────────────────────────────────

export const linkParentService = async (
  id, schoolId, { parentId, relationship, is_primary }, actorId, ipAddress,
) => {
  // Verify student exists and belongs to this school
  const student = await findStudentRaw(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  // Verify the parent account actually exists
  const parent = await findParentById(parentId);
  if (!parent) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Parent not found");
  }

  // Prevent duplicate links
  const existing = await findParentStudentLink(id, parentId);
  if (existing) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "Parent is already linked to this student");
  }

  const link = await linkParentToStudent(id, parentId, relationship, is_primary);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    newValue: { linked_parent: parentId, relationship, is_primary },
    ipAddress,
  });

  return link;
};

// ─────────────────────────────────────────────
// List parents for a student
// ─────────────────────────────────────────────

export const listParentsService = async (id, schoolId) => {
  const student = await findStudentRaw(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }
  return findParentsByStudent(id);
};

// ─────────────────────────────────────────────
// Update parent-student relationship
// ─────────────────────────────────────────────

export const updateParentLinkService = async (
  id, schoolId, parentId, body, actorId, ipAddress,
) => {
  const student = await findStudentRaw(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  const link = await findParentStudentLink(id, parentId);
  if (!link) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Parent is not linked to this student");
  }

  const updated = await updateParentStudentLink(id, parentId, body);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue: { parent: parentId, relationship: link.relationship, is_primary: link.is_primary },
    newValue: { parent: parentId, ...body },
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Unlink parent from student
// ─────────────────────────────────────────────

export const unlinkParentService = async (id, schoolId, parentId, actorId, ipAddress) => {
  const student = await findStudentRaw(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  const link = await findParentStudentLink(id, parentId);
  if (!link) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "Parent is not linked to this student");
  }

  // Warn if this is the last parent — allow it but log clearly
  const linkCount = await countParentLinks(id);
  if (linkCount === 1) {
    // Still allow — admins may unlink intentionally; a warning is enough
    // Extend here with a `force=true` query param guard if your policy changes
  }

  await unlinkParent(id, parentId);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue: { unlinked_parent: parentId, was_primary: link.is_primary },
    newValue: null,
    ipAddress,
  });
};

// ─────────────────────────────────────────────
// Get location consent
// ─────────────────────────────────────────────

export const getLocationConsentService = async (id, schoolId) => {
  const student = await findStudentRaw(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  // Return null-safe default if no record exists yet
  const consent = await findLocationConsent(id);
  return consent ?? { student_id: id, enabled: false, consented_by: null };
};

// ─────────────────────────────────────────────
// Upsert location consent
// ─────────────────────────────────────────────

export const setLocationConsentService = async (
  id, schoolId, { enabled, consented_by }, actorId, ipAddress,
) => {
  const student = await findStudentRaw(id, schoolId);
  if (!student) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.STUDENT_NOT_FOUND);
  }

  const previous = await findLocationConsent(id);
  const updated  = await upsertLocationConsent(id, enabled, consented_by);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action:   AUDIT_ACTIONS.UPDATE_STUDENT,
    entity:   "Student",
    entityId: id,
    oldValue: previous ? { enabled: previous.enabled } : null,
    newValue: { enabled: updated.enabled, consented_by: updated.consented_by },
    ipAddress,
  });

  return updated;
};