import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const optionalTrimmedString = (max = 255) =>
  z.string().trim().max(max).optional();

// IANA timezone list — we just validate it's a non-empty string; real IANA
// validation would need a full list. A sensible default + format check is enough.
const timezoneSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z]+(?:[/_][A-Za-z_]+)*$/,
    "Invalid timezone format (e.g. Asia/Kolkata)",
  )
  .optional();

// E.164-ish phone — flexible enough for international numbers
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

// ---------------------------------------------------------------------------
// POST /v1/schools — Register new school
// ---------------------------------------------------------------------------

export const createSchoolSchema = z.object({
  name: z
    .string({ required_error: "School name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name must not exceed 200 characters"),

  code: z
    .string({ required_error: "School code is required" })
    .trim()
    .toUpperCase()
    .min(3, "Code must be at least 3 characters")
    .max(20, "Code must not exceed 20 characters")
    .regex(
      /^[A-Z0-9_-]+$/,
      "Code must contain only uppercase letters, numbers, hyphens, or underscores",
    ),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),

  phone: phoneSchema,

  address: optionalTrimmedString(500),

  city: optionalTrimmedString(100),

  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "Country must be a 2-letter ISO code (e.g. IN, US)")
    .default("IN"),

  timezone: timezoneSchema,
});

// ---------------------------------------------------------------------------
// PATCH /v1/schools/:id — Update school details (all optional)
// ---------------------------------------------------------------------------

export const updateSchoolSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(200, "Name must not exceed 200 characters")
      .optional(),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email address")
      .optional()
      .or(z.literal("")),

    phone: phoneSchema,

    address: optionalTrimmedString(500),

    city: optionalTrimmedString(100),

    country: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, "Country must be a 2-letter ISO code (e.g. IN, US)")
      .optional(),

    timezone: timezoneSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

// ---------------------------------------------------------------------------
// GET /v1/schools — List / filter query params
// ---------------------------------------------------------------------------

const SORTABLE_FIELDS = ["created_at", "updated_at", "name", "code", "country"];
const SORT_ORDERS = ["asc", "desc"];

export const listSchoolsSchema = z.object({
  page: z.preprocess(
    (val) => (val !== undefined && val !== "" ? parseInt(String(val), 10) : 1),
    z.number().int().min(1, "Page must be at least 1").default(1),
  ),

  limit: z.preprocess(
    (val) => (val !== undefined && val !== "" ? parseInt(String(val), 10) : 20),
    z
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(100, "Limit must not exceed 100")
      .default(20),
  ),

  search: z.string().trim().max(100).optional(),

  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "Country must be a 2-letter ISO code")
    .optional(),

  is_active: z.preprocess((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined;
  }, z.boolean().optional()),

  sortBy: z
    .enum(SORTABLE_FIELDS, {
      errorMap: () => ({
        message: `sortBy must be one of: ${SORTABLE_FIELDS.join(", ")}`,
      }),
    })
    .default("created_at"),

  sortOrder: z
    .enum(SORT_ORDERS, {
      errorMap: () => ({ message: "sortOrder must be asc or desc" }),
    })
    .default("desc"),
});

// ---------------------------------------------------------------------------
// PATCH /v1/schools/:id/logo — Logo upload
// (file itself validated via multer; this validates any body fields if needed)
// ---------------------------------------------------------------------------

export const uploadLogoSchema = z.object({
  // intentionally empty — validation is done by multer middleware
  // kept as a schema so the validate() middleware call is consistent
});

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

export const uuidParamSchema = z.object({
  id: z.string({ required_error: "ID is required" }).uuid("Invalid ID format"),
});

export const codeParamSchema = z.object({
  code: z
    .string({ required_error: "School code is required" })
    .trim()
    .toUpperCase()
    .min(3)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, "Invalid school code format"),
});
