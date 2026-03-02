import { ApiError } from "../../utils/ApiError.js";
import * as schoolRepo from "./school.repository.js";
import {
  findAllSchools,
  findSchoolBy_Id,
  findSchoolByCode,
  findSchoolByCodeRaw,
  createSchool,
  updateSchoolById,
  updateSchoolLogo,
  activateSchool,
  deactivateSchool,
  hardDeleteSchool,
  countSchoolStudents,
  countSchoolUsers,
} from "./school.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import { HTTP_STATUS, PAGINATION } from "../../config/constants.js";

/**
 * Validate that a school exists and is active.
 * Throws ApiError if not found or inactive.
 * @param {string} schoolId
 * @returns {object} school with settings
 */
export const validateSchool = async (schoolId) => {
  const school = await schoolRepo.findSchoolById(schoolId);

  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  }

  if (!school.is_active) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "School account is inactive");
  }

  return school;
};

// ---------------------------------------------------------------------------
// List schools
// SUPER_ADMIN  → full paginated list with all filters
// SCHOOL_ADMIN → ownSchoolId is set; return only their school as a single-item list
// ---------------------------------------------------------------------------

export const listSchools = async (query, ownSchoolId = null) => {
  // SCHOOL_ADMIN: skip pagination entirely, just return their school
  if (ownSchoolId) {
    const school = await findSchoolById(ownSchoolId);
    if (!school) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
    return {
      data: [school],
      meta: { total: 1, page: 1, limit: 1, total_pages: 1 },
    };
  }

  const page = query.page ?? PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(
    query.limit ?? PAGINATION.DEFAULT_LIMIT,
    PAGINATION.MAX_LIMIT,
  );
  const search = query.search ?? undefined;
  const country = query.country ?? undefined;
  const is_active = query.is_active;
  const sortBy = query.sortBy ?? "created_at";
  const sortOrder = query.sortOrder ?? "desc";

  const { schools, total } = await findAllSchools({
    page,
    limit,
    search,
    country,
    is_active,
    sortBy,
    sortOrder,
  });

  return {
    data: schools,
    meta: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

// ---------------------------------------------------------------------------
// Get school by ID
// Ownership already enforced by restrictToOwnSchool middleware before this runs
// ---------------------------------------------------------------------------

export const getSchoolById = async (id) => {
  const school = await findSchoolBy_Id(id);
  if (!school) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  return school;
};

// ---------------------------------------------------------------------------
// Get school by code
// SCHOOL_ADMIN: ownSchoolId is set — verify the resolved school matches
// ---------------------------------------------------------------------------

export const getSchoolByCode = async (code, ownSchoolId = null) => {
  const school = await findSchoolByCode(code);
  if (!school) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");

  if (ownSchoolId && school.id !== ownSchoolId) {
    throw new ApiError(
      HTTP_STATUS.FORBIDDEN,
      "You can only access your own school",
    );
  }

  return school;
};

// ---------------------------------------------------------------------------
// Register new school (SUPER_ADMIN only — enforced at route level)
// ---------------------------------------------------------------------------

export const registerSchool = async (data) => {
  const existing = await findSchoolByCodeRaw(data.code);
  if (existing) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      `School code "${data.code}" is already in use`,
    );
  }
  return createSchool(data);
};

// ---------------------------------------------------------------------------
// Update school details (SUPER_ADMIN only — enforced at route level)
// ---------------------------------------------------------------------------

export const updateSchool = async (id, data) => {
  const existing = await findSchoolBy_Id(id);
  if (!existing) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");

  const sanitized = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== ""),
  );

  if (Object.keys(sanitized).length === 0) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      "No valid fields provided for update",
    );
  }

  return updateSchoolById(id, sanitized);
};

// ---------------------------------------------------------------------------
// Upload / replace school logo (SUPER_ADMIN only — enforced at route level)
// ---------------------------------------------------------------------------

export const uploadSchoolLogo = async (id, file) => {
  if (!file)
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, "Logo file is required");

  const existing = await findSchoolBy_Id(id);
  if (!existing) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");

  const logo_url = file.path ?? file.secure_url ?? file.url;
  if (!logo_url) {
    throw new ApiError(
      HTTP_STATUS.INTERNAL_ERROR,
      "Logo upload failed — no URL returned",
    );
  }

  return updateSchoolLogo(id, logo_url);
};

// ---------------------------------------------------------------------------
// Activate (SUPER_ADMIN only — enforced at route level)
// ---------------------------------------------------------------------------

export const activateSchoolById = async (id) => {
  const existing = await findSchoolBy_Id(id);
  if (!existing) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  if (existing.is_active)
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, "School is already active");
  return activateSchool(id);
};

// ---------------------------------------------------------------------------
// Deactivate (SUPER_ADMIN only — enforced at route level)
// ---------------------------------------------------------------------------

export const deactivateSchoolById = async (id) => {
  const existing = await findSchoolBy_Id(id);
  if (!existing) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  if (!existing.is_active)
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, "School is already inactive");
  return deactivateSchool(id);
};

// ---------------------------------------------------------------------------
// Hard delete (SUPER_ADMIN only — enforced at route level)
// ---------------------------------------------------------------------------

export const deleteSchool = async (id) => {
  const existing = await findSchoolById(id);
  if (!existing) throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");

  if (existing.is_active) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      "School must be deactivated before it can be deleted",
    );
  }

  const [studentCount, userCount] = await Promise.all([
    countSchoolStudents(id),
    countSchoolUsers(id),
  ]);

  if (studentCount > 0) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `Cannot delete school — ${studentCount} active student(s) still linked`,
    );
  }

  if (userCount > 0) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `Cannot delete school — ${userCount} active user(s) still linked`,
    );
  }

  return hardDeleteSchool(id);
};
