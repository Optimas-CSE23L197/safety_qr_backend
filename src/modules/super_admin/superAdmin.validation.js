import { z } from "zod";

//////////////////////////////
//! Register Super Admin
//////////////////////////////

export const registerSuperAdminSchema = z.object({
  name: z
    .string({ required_error: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),

  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
    ),
});

//////////////////////////////
//! Update Super Admin (PATCH — all optional)
//////////////////////////////

export const updateSuperAdminSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must not exceed 100 characters")
      .optional(),

    is_active: z
      .boolean({ invalid_type_error: "is_active must be a boolean" })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (name or is_active) must be provided",
  });

//////////////////////////////
//! Change Password
//////////////////////////////

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ required_error: "Current password is required" })
      .min(1, "Current password is required"),

    new_password: z
      .string({ required_error: "New password is required" })
      .min(8, "New password must be at least 8 characters")
      .max(72, "New password must not exceed 72 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
        "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
      ),

    confirm_password: z.string({
      required_error: "Confirm password is required",
    }),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "New password must be different from the current password",
    path: ["new_password"],
  });

//////////////////////////////
//! Pagination Query
//////////////////////////////

export const paginationSchema = z.object({
  // Query strings are always strings — preprocess converts before validation
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

  search: z.string().trim().optional(),

  // "true" / "false" strings → actual booleans. Absent → undefined (no filter applied)
  is_active: z.preprocess((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined; // not provided — skip filter
  }, z.boolean().optional()),
});

//////////////////////////////
//! UUID Param
//////////////////////////////

export const uuidParamSchema = z.object({
  id: z.string({ required_error: "ID is required" }).uuid("Invalid ID format"),
});
