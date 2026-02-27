import prisma from "../../config/prisma.js";

/**
 * Find school by ID — optionally include settings relation
 */
export const findSchoolById = (id, { includeSettings = false } = {}) =>
  prisma.school.findUnique({
    where: { id },
    include: includeSettings ? { settings: true } : undefined,
  });

/**
 * Find school by unique code
 */
export const findSchoolByCode = (code) =>
  prisma.school.findUnique({ where: { code } });

/**
 * Find school by email
 */
export const findSchoolByEmail = (email) =>
  prisma.school.findFirst({ where: { email } });

/**
 * Paginated list — supports search, country, is_active filter & sorting
 */
export const findAllSchools = ({
  skip,
  take,
  search,
  country,
  is_active,
  sortBy = "created_at",
  sortOrder = "desc",
}) => {
  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(country && { country }),
    ...(typeof is_active === "boolean" && { is_active }),
  };

  return prisma.$transaction([
    prisma.school.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        phone: true,
        city: true,
        country: true,
        is_active: true,
        logo_url: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.school.count({ where }),
  ]);
};

/**
 * Create a new school — also creates default SchoolSettings in the same transaction
 */
export const createSchool = (data) =>
  prisma.school.create({
    data: {
      ...data,
      settings: {
        create: {}, // seeds all defaults from SchoolSettings model
      },
    },
    include: { settings: true },
  });

/**
 * Update school fields
 */
export const updateSchoolById = (id, data) =>
  prisma.school.update({
    where: { id },
    data,
  });

/**
 * Update only the logo_url
 */
export const updateSchoolLogo = (id, logo_url) =>
  prisma.school.update({
    where: { id },
    data: { logo_url },
    select: { id: true, logo_url: true, updated_at: true },
  });

/**
 * Hard delete — cascades students, tokens, etc. per schema onDelete: Cascade
 */
export const deleteSchoolById = (id) =>
  prisma.school.delete({ where: { id } });

/**
 * Check if school code is already taken (used on create & update)
 */
export const isSchoolCodeTaken = async (code, excludeId) => {
  const school = await prisma.school.findUnique({ where: { code } });
  return school && school.id !== excludeId;
};