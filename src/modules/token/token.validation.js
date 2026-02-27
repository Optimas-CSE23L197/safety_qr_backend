import { z } from "zod";

const MAX_BULK_LIMIT = 1000;

// =============================================================================
// SHARED FIELDS
// =============================================================================

/**
 * Optional schoolId field — only required when actorType is "super_admin".
 * For school users, schoolId is always resolved from auth context and ignored here.
 * Validated as UUID to prevent injection of non-UUID identifiers.
 */
const optionalSchoolId = z
  .string()
  .uuid("schoolId must be a valid UUID")
  .optional();

// =============================================================================
// SINGLE BLANK TOKEN
// =============================================================================

export const generateSingleBlankSchema = z.object({
  schoolId: optionalSchoolId,
  notes: z.string().max(255).optional().nullable(),
});

// =============================================================================
// BULK BLANK TOKENS
// =============================================================================

export const generateBulkBlankSchema = z.object({
  schoolId: optionalSchoolId,
  count: z
    .number({
      required_error: "count is required",
      invalid_type_error: "count must be a number",
    })
    .int("count must be a whole number")
    .min(1, "count must be at least 1")
    .max(MAX_BULK_LIMIT, `count cannot exceed ${MAX_BULK_LIMIT}`),
  notes: z.string().max(255).optional().nullable(),
});

// =============================================================================
// SINGLE PRELOADED TOKEN
// =============================================================================

export const generateSinglePreloadedSchema = z.object({
  schoolId: optionalSchoolId,
  studentId: z
    .string({ required_error: "studentId is required" })
    .uuid("studentId must be a valid UUID"),
});

// =============================================================================
// BULK PRELOADED TOKENS
// =============================================================================

export const generateBulkPreloadedSchema = z.object({
  schoolId: optionalSchoolId,
  studentIds: z
    .array(z.string().uuid("each studentId must be a valid UUID"), {
      required_error: "studentIds is required",
      invalid_type_error: "studentIds must be an array",
    })
    .min(1, "studentIds must contain at least one student")
    .max(MAX_BULK_LIMIT, `studentIds cannot exceed ${MAX_BULK_LIMIT} entries`),
  notes: z.string().max(255).optional().nullable(),
});
