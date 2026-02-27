import { z } from "zod";

// ─────────────────────────────────────────────
// Reusable field definitions
// ─────────────────────────────────────────────

const uuidParam = z.string().uuid("Invalid ID format");

const codeField = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "Code must be at least 2 characters")
  .max(20, "Code must not exceed 20 characters")
  .regex(/^[A-Z0-9_-]+$/, "Code can only contain letters, numbers, hyphens, and underscores");

const urlField = z.string().url("Must be a valid URL").optional().nullable();

// ─────────────────────────────────────────────
// Create School
// ─────────────────────────────────────────────
export const createSchoolSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "School name is required" })
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(150, "Name must not exceed 150 characters"),

    code: codeField,

    address: z.string().trim().max(255).optional(),
    city: z.string().trim().max(100).optional(),
    country: z.string().length(2, "Country must be a 2-letter ISO code").default("IN"),
    timezone: z.string().max(50).default("Asia"),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number")
      .optional()
      .nullable(),
    email: z.string().trim().toLowerCase().email("Invalid email address").optional().nullable(),
    logo_url: urlField,
  }),
});

// ─────────────────────────────────────────────
// Update School — all fields optional
// ─────────────────────────────────────────────
export const updateSchoolSchema = z.object({
  params: z.object({ id: uuidParam }),
  body: z
    .object({
      name: z.string().trim().min(2).max(150).optional(),
      code: codeField.optional(),
      address: z.string().trim().max(255).optional().nullable(),
      city: z.string().trim().max(100).optional().nullable(),
      country: z.string().length(2, "Country must be a 2-letter ISO code").optional(),
      timezone: z.string().max(50).optional(),
      phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, "Invalid phone number")
        .optional()
        .nullable(),
      email: z.string().trim().toLowerCase().email().optional().nullable(),
      logo_url: urlField,
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

// ─────────────────────────────────────────────
// Update Logo
// ─────────────────────────────────────────────
export const updateSchoolLogoSchema = z.object({
  params: z.object({ id: uuidParam }),
  body: z.object({
    logo_url: z
      .string({ required_error: "logo_url is required" })
      .url("Must be a valid URL"),
  }),
});

// ─────────────────────────────────────────────
// ID param — reused by get / activate / deactivate / delete
// ─────────────────────────────────────────────
export const schoolIdParamSchema = z.object({
  params: z.object({ id: uuidParam }),
});

// ─────────────────────────────────────────────
// Code param — GET /schools/code/:code
// ─────────────────────────────────────────────
export const schoolCodeParamSchema = z.object({
  params: z.object({
    code: z
      .string({ required_error: "School code is required" })
      .trim()
      .toUpperCase()
      .min(2)
      .max(20),
  }),
});

// ─────────────────────────────────────────────
// List Schools — query params
// ─────────────────────────────────────────────
export const listSchoolsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v) : undefined))
      .refine((v) => v === undefined || (Number.isInteger(v) && v > 0), {
        message: "page must be a positive integer",
      }),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v) : undefined))
      .refine((v) => v === undefined || (Number.isInteger(v) && v > 0 && v <= 100), {
        message: "limit must be between 1 and 100",
      }),
    search: z.string().trim().max(100).optional(),
    country: z.string().length(2).toUpperCase().optional(),
    is_active: z.enum(["true", "false"]).optional(),
    sortBy: z
      .enum(["name", "code", "city", "country", "created_at", "updated_at"])
      .optional()
      .default("created_at"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  }),
});