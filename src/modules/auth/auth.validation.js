import { z } from "zod";

// =============================================================================
// Auth Validation — single source of truth for all three login flows
//
// Three actors:
//   SuperAdmin  → email + password
//   SchoolUser  → email + password
//   ParentUser  → phone + OTP (two steps)
// =============================================================================

// ---------------------------------------------------------------------------
// Shared — email + password (used by both SuperAdmin and SchoolUser)
// ---------------------------------------------------------------------------
export const emailPasswordValidation = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Invalid email address"),

  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(64, "Password too long"),
});

// ---------------------------------------------------------------------------
// Parent — Step 1: Request OTP
// ---------------------------------------------------------------------------
export const sendOtpValidation = z.object({
  phone: z
    .string({ required_error: "Phone number is required" })
    .trim()
    .regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number"),
});

// ---------------------------------------------------------------------------
// Parent — Step 2: Verify OTP → receive tokens
// ---------------------------------------------------------------------------
export const verifyOtpValidation = z.object({
  phone: z
    .string({ required_error: "Phone number is required" })
    .trim()
    .regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number"),

  otp: z
    .string({ required_error: "OTP is required" })
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must contain only digits"),
});
