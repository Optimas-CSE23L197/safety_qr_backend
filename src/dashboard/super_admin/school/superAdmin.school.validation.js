import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const optionalString = (max = 255) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

const timezoneSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z]+(?:[/_][A-Za-z_]+)*$/,
    "Invalid timezone format (e.g. Asia/Kolkata)",
  )
  .default("Asia/Kolkata");

// ---------------------------------------------------------------------------
// POST /register — nested schema matching request body shape exactly
// ---------------------------------------------------------------------------

const schoolSchema = z.object({
  name: z
    .string({ required_error: "School name is required" })
    .trim()
    .min(2, "Must be at least 2 characters")
    .max(200, "Must not exceed 200 characters"),

  code: z
    .string({ required_error: "School code is required" })
    .trim()
    .toUpperCase()
    .min(3, "Must be at least 3 characters")
    .max(20, "Must not exceed 20 characters")
    .regex(
      /^[A-Z0-9_-]+$/,
      "Only uppercase letters, numbers, hyphens, underscores (e.g. DPS-NOIDA)",
    ),

  email: z
    .string({ required_error: "School email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  phone: phoneSchema,

  city: z
    .string({ required_error: "City is required" })
    .trim()
    .min(1, "City is required")
    .max(100),

  address: optionalString(500),

  timezone: timezoneSchema,

  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "Must be a 2-letter ISO code (e.g. IN, US)")
    .default("IN"),
});

const adminSchema = z.object({
  name: z
    .string({ required_error: "Admin name is required" })
    .trim()
    .min(2, "Must be at least 2 characters")
    .max(80, "Must not exceed 80 characters"),

  email: z
    .string({ required_error: "Admin email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  password: z
    .string({ required_error: "Temporary password is required" })
    .min(8, "Must be at least 8 characters")
    .max(64, "Must not exceed 64 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),

  role: z
    .enum(["ADMIN", "STAFF", "VIEWER"], {
      errorMap: () => ({ message: "Role must be ADMIN, STAFF, or VIEWER" }),
    })
    .default("ADMIN"),
});

// Subscription is a stub — plan label + trial only, no pricing fields yet
const subscriptionSchema = z.object({
  plan: z
    .enum(["starter", "growth", "enterprise"], {
      errorMap: () => ({
        message: "Plan must be starter, growth, or enterprise",
      }),
    })
    .default("growth"),

  trialDays: z.preprocess(
    (v) => (v !== undefined ? Number(v) : 14),
    z
      .number()
      .int()
      .refine((v) => [0, 7, 14, 30].includes(v), {
        message: "Trial days must be 0, 7, 14, or 30",
      })
      .default(14),
  ),
});

export const registerSchoolValidation = z.object({
  school: schoolSchema,
  admin: adminSchema,
  subscription: subscriptionSchema,
});

// ---------------------------------------------------------------------------
// GET / — list schools query params
// ---------------------------------------------------------------------------

const SORTABLE_FIELDS = ["created_at", "updated_at", "name", "code", "city"];

export const listSchoolsQueryValidation = z.object({
  page: z.preprocess(
    (v) => (v !== undefined && v !== "" ? parseInt(String(v), 10) : 1),
    z.number().int().min(1, "Page must be at least 1").default(1),
  ),

  limit: z.preprocess(
    (v) => (v !== undefined && v !== "" ? parseInt(String(v), 10) : 20),
    z.number().int().min(1).max(100, "Limit must not exceed 100").default(20),
  ),

  search: z.string().trim().max(100).optional(),

  is_active: z.preprocess((v) => {
    if (v === "true") return true;
    if (v === "false") return false;
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
    .enum(["asc", "desc"], {
      errorMap: () => ({ message: "sortOrder must be asc or desc" }),
    })
    .default("desc"),
});

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

export const uuidParamSchema = z.object({
  id: z
    .string({ required_error: "ID is required" })
    .uuid("Invalid UUID format"),
});
