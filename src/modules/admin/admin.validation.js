import { z } from "zod";

// create admin (all required)
export const createAdminSchema = z.object({
  name: z.string().min(2).max(50).trim(),
  email: z.string().email().toLowerCase().trim(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
  role: z.enum(["SUPER_ADMIN", "ADMIN"]),
});

// update admin (all optional)
export const updateAdminSchema = z.object({
  name: z.string().min(2).max(50).trim().optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/)
    .optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN"]).optional(),
});
