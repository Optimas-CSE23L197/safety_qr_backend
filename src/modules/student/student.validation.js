import { z } from "zod";

// ─────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────

const uuidParam  = z.string().uuid("Invalid ID format");
const urlField   = z.string().url("Must be a valid URL").optional().nullable();

/** schoolId + student id — shared by nearly every route */
const schoolStudentParams = z.object({
  schoolId: uuidParam,
  id:       uuidParam,
});

// ─────────────────────────────────────────────
// Enroll student  POST /students
// ─────────────────────────────────────────────
export const enrollStudentSchema = z.object({
  params: z.object({ schoolId: uuidParam }),
  body: z.object({
    first_name: z
      .string({ required_error: "First name is required" })
      .trim()
      .min(1, "First name cannot be empty")
      .max(100),

    last_name: z
      .string()
      .trim()
      .max(100)
      .optional()
      .nullable(),

    class: z
      .string()
      .trim()
      .max(20)
      .optional()
      .nullable(),

    section: z
      .string()
      .trim()
      .max(10)
      .optional()
      .nullable(),

    photo_url: urlField,

    dob_encrypted: z
      .string()
      .max(512, "Encrypted DOB too long")
      .optional()
      .nullable(),
  }),
});

// ─────────────────────────────────────────────
// List students  GET /students
// ─────────────────────────────────────────────
export const listStudentsSchema = z.object({
  params: z.object({ schoolId: uuidParam }),
  query: z.object({
    page: z
      .string().optional()
      .transform((v) => (v ? parseInt(v) : undefined))
      .refine((v) => v === undefined || (Number.isInteger(v) && v > 0), {
        message: "page must be a positive integer",
      }),

    limit: z
      .string().optional()
      .transform((v) => (v ? parseInt(v) : undefined))
      .refine((v) => v === undefined || (Number.isInteger(v) && v > 0 && v <= 100), {
        message: "limit must be between 1 and 100",
      }),

    search:    z.string().trim().max(100).optional(),
    class:     z.string().trim().max(20).optional(),
    section:   z.string().trim().max(10).optional(),
    is_active: z.enum(["true", "false"]).optional(),

    sortBy: z
      .enum(["first_name", "last_name", "class", "section", "created_at"])
      .optional()
      .default("first_name"),

    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  }),
});

// ─────────────────────────────────────────────
// Student ID param only  GET /students/:id  DELETE  PATCH /activate  PATCH /deactivate
// ─────────────────────────────────────────────
export const studentIdParamSchema = z.object({
  params: schoolStudentParams,
});

// ─────────────────────────────────────────────
// Update student  PATCH /students/:id
// ─────────────────────────────────────────────
export const updateStudentSchema = z.object({
  params: schoolStudentParams,
  body: z
    .object({
      first_name:    z.string().trim().min(1).max(100).optional(),
      last_name:     z.string().trim().max(100).optional().nullable(),
      class:         z.string().trim().max(20).optional().nullable(),
      section:       z.string().trim().max(10).optional().nullable(),
      dob_encrypted: z.string().max(512).optional().nullable(),
    })
    .refine((d) => Object.keys(d).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

// ─────────────────────────────────────────────
// Update photo  PATCH /students/:id/photo
// ─────────────────────────────────────────────
export const updateStudentPhotoSchema = z.object({
  params: schoolStudentParams,
  body: z.object({
    photo_url: z
      .string({ required_error: "photo_url is required" })
      .url("Must be a valid URL"),
  }),
});

// ─────────────────────────────────────────────
// Link parent  POST /students/:id/parents
// ─────────────────────────────────────────────
export const linkParentSchema = z.object({
  params: schoolStudentParams,
  body: z.object({
    parentId: z
      .string({ required_error: "parentId is required" })
      .uuid("Invalid parent ID"),

    relationship: z
      .string()
      .trim()
      .max(50)
      .optional()
      .nullable(),

    is_primary: z.boolean().optional().default(false),
  }),
});

// ─────────────────────────────────────────────
// Parent-student link param  PATCH / DELETE /students/:id/parents/:parentId
// ─────────────────────────────────────────────
export const parentLinkParamSchema = z.object({
  params: z.object({
    schoolId: uuidParam,
    id:       uuidParam,
    parentId: uuidParam,
  }),
});

// ─────────────────────────────────────────────
// Update parent link  PATCH /students/:id/parents/:parentId
// ─────────────────────────────────────────────
export const updateParentLinkSchema = z.object({
  params: z.object({
    schoolId: uuidParam,
    id:       uuidParam,
    parentId: uuidParam,
  }),
  body: z
    .object({
      relationship: z.string().trim().max(50).optional().nullable(),
      is_primary:   z.boolean().optional(),
    })
    .refine((d) => Object.keys(d).length > 0, {
      message: "At least one field must be provided",
    }),
});

// ─────────────────────────────────────────────
// Location consent  PUT /students/:id/location-consent
// ─────────────────────────────────────────────
export const setLocationConsentSchema = z.object({
  params: schoolStudentParams,
  body: z.object({
    enabled: z.boolean({ required_error: "enabled (boolean) is required" }),
    consented_by: z
      .string()
      .uuid("consented_by must be a valid parent or admin UUID")
      .optional()
      .nullable(),
  }),
});