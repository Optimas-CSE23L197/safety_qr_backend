import { z } from "zod";

const scanRequestSchema = z.object({
  token: z
    .string()
    .trim()
    .min(32)
    .max(128)
    .regex(/^[a-f0-9]+$/i, "Invalid QR code format"),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().positive().optional(),
    })
    .optional(),
});

export const validateScanRequest = (body) => {
  const result = scanRequestSchema.safeParse(body);
  if (!result.success) {
    return {
      data: null,
      error: result.error.errors[0]?.message ?? "Invalid request",
    };
  }
  return { data: result.data, error: null };
};
