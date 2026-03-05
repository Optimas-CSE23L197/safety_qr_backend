import { z } from "zod";

// ─── Register Init ────────────────────────────────────────────────────────────

export const validateRegisterInit = z.object({
  card_number: z.string().trim().min(4, "Card number is required").max(64),

  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[1-9]\d{7,14}$/,
      "Enter a valid phone number (e.g. +919876543210)",
    ),
});

// ─── Register Verify ──────────────────────────────────────────────────────────

export const validateRegisterVerify = z.object({
  nonce: z.string().trim().min(8, "Nonce is required").max(128),
  otp: z
    .string()
    .trim()
    .length(6, "OTP must be 6 digits")
    .regex(/^\d{6}$/, "OTP must be 6 digits"),
  phone: z
    .string()
    .trim()
    .regex(/^+?[1-9]\d{7,14}$/),
});

// ─── Update Student Profile ───────────────────────────────────────────────────

// Student
const studentSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional().or(z.literal("")),
  class: z.string().trim().max(20).optional().or(z.literal("")),
  section: z.string().trim().max(20).optional().or(z.literal("")),
  photo_url: z.string().url().optional().nullable().or(z.literal("")),
});

// Emergency
const emergencySchema = z.object({
  blood_group: z
    .enum(["A+", "A−", "B+", "B−", "O+", "O−", "AB+", "AB−", "Unknown"])
    .optional()
    .nullable()
    .or(z.literal("")),

  allergies: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .or(z.literal("")),
  conditions: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .or(z.literal("")),
  medications: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .or(z.literal("")),
  doctor_name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("")),

  doctor_phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/)
    .optional()
    .nullable()
    .or(z.literal("")),

  notes: z.string().trim().max(2000).optional().nullable().or(z.literal("")),
});

// Contact
const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number"),
  relationship: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable()
    .or(z.literal("")),
});

// ─── Final Update Schema (equivalent of Joi .or()) ────────────────────────────

export const validateUpdateStudent = z
  .object({
    student: studentSchema.optional(),
    emergency: emergencySchema.optional(),
    contacts: z.array(contactSchema).max(5).optional(),
  })
  .refine((data) => data.student || data.emergency || data.contacts, {
    message: "At least one section (student, emergency, contacts) is required",
  });
