import { auditLog } from "../../utils/auditLogger.js";
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  AUDIT_ACTIONS,
  PAGINATION,
} from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginate } from "../../utils/paginate.js";
import {
  findSchoolById,
  findSchoolByCode,
  findSchoolByEmail,
  findAllSchools,
  createSchool,
  updateSchoolById,
  updateSchoolLogo,
  deleteSchoolById,
  isSchoolCodeTaken,
} from "./school.repository.js";

// ─────────────────────────────────────────────
// Create School
// ─────────────────────────────────────────────

export const createSchoolService = async (body, actorId, ipAddress) => {
  // Code must be unique — it's the tenant identifier
  const codeTaken = await findSchoolByCode(body.code);
  if (codeTaken) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "School code already in use");
  }

  // Email uniqueness check (optional field — only validate if provided)
  if (body.email) {
    const emailTaken = await findSchoolByEmail(body.email);
    if (emailTaken) {
      throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_MESSAGES.EMAIL_ALREADY_USED);
    }
  }

  const school = await createSchool(body);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action: AUDIT_ACTIONS.CREATE_SCHOOL,
    entity: "School",
    entityId: school.id,
    newValue: { name: school.name, code: school.code },
    ipAddress,
  });

  return school;
};

// ─────────────────────────────────────────────
// List Schools (paginated + filterable)
// ─────────────────────────────────────────────

export const listSchoolsService = async (query) => {
  const page = parseInt(query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(parseInt(query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * limit;

  const is_active =
    query.is_active === "true" ? true : query.is_active === "false" ? false : undefined;

  const [schools, total] = await findAllSchools({
    skip,
    take: limit,
    search: query.search,
    country: query.country,
    is_active,
    sortBy: query.sortBy || "created_at",
    sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
  });

  return paginate(schools, total, page, limit);
};

// ─────────────────────────────────────────────
// Get School by ID
// ─────────────────────────────────────────────

export const getSchoolByIdService = async (id) => {
  const school = await findSchoolById(id, { includeSettings: true });
  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }
  return school;
};

// ─────────────────────────────────────────────
// Get School by Code
// ─────────────────────────────────────────────

export const getSchoolByCodeService = async (code) => {
  const school = await findSchoolByCode(code);
  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }
  return school;
};

// ─────────────────────────────────────────────
// Update School
// ─────────────────────────────────────────────

export const updateSchoolService = async (id, body, actorId, ipAddress) => {
  const existing = await findSchoolById(id);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  // Guard: if code is being changed ensure it's not taken by another school
  if (body.code && body.code !== existing.code) {
    const codeTaken = await isSchoolCodeTaken(body.code, id);
    if (codeTaken) {
      throw new ApiError(HTTP_STATUS.CONFLICT, "School code already in use");
    }
  }

  // Guard: if email is being changed ensure it's not taken by another school
  if (body.email && body.email !== existing.email) {
    const emailTaken = await findSchoolByEmail(body.email);
    if (emailTaken && emailTaken.id !== id) {
      throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_MESSAGES.EMAIL_ALREADY_USED);
    }
  }

  const updated = await updateSchoolById(id, body);

  // Build a clean diff for the audit trail (only changed fields)
  const oldValue = {};
  const newValue = {};
  for (const key of Object.keys(body)) {
    if (existing[key] !== updated[key]) {
      oldValue[key] = existing[key];
      newValue[key] = updated[key];
    }
  }

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action: AUDIT_ACTIONS.UPDATE_SCHOOL,
    entity: "School",
    entityId: id,
    oldValue,
    newValue,
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Update School Logo
// ─────────────────────────────────────────────

export const updateSchoolLogoService = async (id, logo_url, actorId, ipAddress) => {
  const existing = await findSchoolById(id);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  const updated = await updateSchoolLogo(id, logo_url);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action: AUDIT_ACTIONS.UPDATE_SCHOOL,
    entity: "School",
    entityId: id,
    oldValue: { logo_url: existing.logo_url },
    newValue: { logo_url: updated.logo_url },
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Activate School
// ─────────────────────────────────────────────

export const activateSchoolService = async (id, actorId, ipAddress) => {
  const existing = await findSchoolById(id);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }
  if (existing.is_active) {
    throw new ApiError(HTTP_STATUS.CONFLICT, "School is already active");
  }

  const updated = await updateSchoolById(id, { is_active: true });

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action: AUDIT_ACTIONS.UPDATE_SCHOOL,
    entity: "School",
    entityId: id,
    oldValue: { is_active: false },
    newValue: { is_active: true },
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Deactivate School
// ─────────────────────────────────────────────

export const deactivateSchoolService = async (id, actorId, ipAddress) => {
  const existing = await findSchoolById(id);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }
  if (!existing.is_active) {
    throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_MESSAGES.SCHOOL_NOT_ACTIVE);
  }

  const updated = await updateSchoolById(id, { is_active: false });

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action: AUDIT_ACTIONS.UPDATE_SCHOOL,
    entity: "School",
    entityId: id,
    oldValue: { is_active: true },
    newValue: { is_active: false },
    ipAddress,
  });

  return updated;
};

// ─────────────────────────────────────────────
// Delete School (hard — SUPER_ADMIN only)
// ─────────────────────────────────────────────

export const deleteSchoolService = async (id, actorId, ipAddress) => {
  const existing = await findSchoolById(id);
  if (!existing) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  await deleteSchoolById(id);

  auditLog({
    actorType: "SUPER_ADMIN",
    actorId,
    action: AUDIT_ACTIONS.UPDATE_SCHOOL, // extend AUDIT_ACTIONS with DELETE_SCHOOL if needed
    entity: "School",
    entityId: id,
    oldValue: { name: existing.name, code: existing.code },
    newValue: null,
    ipAddress,
  });
};