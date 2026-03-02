import bcrypt from "bcrypt";
import { ApiError } from "../../../utils/ApiError.js";
import { HTTP_STATUS, PAGINATION } from "../../../config/constants.js";
import {
  findSchoolByCode,
  findSchoolUserByEmail,
  findSchoolById,
  createSchoolWithAdmin,
  getAllSchools,
  getSchoolDetail,
  setSchoolActiveStatus,
} from "./superAdmin.school.repository.js";

// ---------------------------------------------------------------------------
// Register school
// Pre-flight: check code + admin email uniqueness, hash password, call repo
// ---------------------------------------------------------------------------

export const registerSchool = async ({ school, admin, subscription }) => {
  // 1. School code must be unique
  const existingCode = await findSchoolByCode(school.code);
  if (existingCode) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      `School code "${school.code}" is already in use`,
    );
  }

  // 2. Admin email must be unique across all school users
  const existingEmail = await findSchoolUserByEmail(admin.email);
  if (existingEmail) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      `Email "${admin.email}" is already registered to another user`,
    );
  }

  // 3. Hash password in service — keeps bcrypt out of the DB transaction
  const password_hash = await bcrypt.hash(admin.password, 12);

  // 4. Persist everything in a single transaction
  return createSchoolWithAdmin({
    schoolData: school,
    adminData: { ...admin, password_hash },
    subscriptionData: subscription,
  });
};

// ---------------------------------------------------------------------------
// List schools — SUPER_ADMIN paginated view
// ---------------------------------------------------------------------------

export const listSchools = async (query) => {
  const page = query.page ?? PAGINATION.DEFAULT_PAGE;
  const limit = Math.min(
    query.limit ?? PAGINATION.DEFAULT_LIMIT,
    PAGINATION.MAX_LIMIT,
  );

  const { schools, total } = await getAllSchools({
    page,
    limit,
    search: query.search ?? undefined,
    is_active: query.is_active ?? undefined,
    sortBy: query.sortBy ?? "created_at",
    sortOrder: query.sortOrder ?? "desc",
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
// Get school by ID — full detail
// ---------------------------------------------------------------------------

export const getSchoolById = async (id) => {
  const school = await getSchoolDetail(id);
  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  }
  return school;
};

// ---------------------------------------------------------------------------
// Activate school
// ---------------------------------------------------------------------------

export const activateSchool = async (id) => {
  const school = await findSchoolById(id);
  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  }
  if (school.is_active) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, "School is already active");
  }
  return setSchoolActiveStatus(id, true);
};

// ---------------------------------------------------------------------------
// Deactivate school
// Revokes all active sessions for this school's users (handled in repo)
// ---------------------------------------------------------------------------

export const deactivateSchool = async (id) => {
  const school = await findSchoolById(id);
  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  }
  if (!school.is_active) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, "School is already inactive");
  }
  return setSchoolActiveStatus(id, false);
};
