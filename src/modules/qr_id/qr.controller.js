import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { HTTP_STATUS } from "../../config/constants.js";
import * as qrService from "./qr.service.js";
import {
  generateSingleBlankSchema,
  generateBulkBlankSchema,
  generateSinglePreloadedSchema,
  generateBulkPreloadedSchema,
} from "./qr.validation.js";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate request body against a Zod schema.
 * Throws ApiError with 400 on validation failure.
 * Uses safeParse so Zod never throws internally.
 */
const validate = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors.map((e) => e.message).join(", ");
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, messages);
  }
  return result.data;
};

// =============================================================================
// CONTROLLERS
// =============================================================================

/**
 * POST /api/qr/blank/single
 * Generate one blank token — no student attached.
 */
export const generateSingleBlank = asyncHandler(async (req, res) => {
  const { notes } = validate(generateSingleBlankSchema, req.body);

  const result = await qrService.generateSingleBlankToken({
    schoolId: req.user.school_id,
    createdBy: req.user.id,
    ipAddress: req.ip,
    notes,
  });

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      new ApiResponse(
        HTTP_STATUS.CREATED,
        result,
        "Blank token generated successfully",
      ),
    );
});

/**
 * POST /api/qr/blank/bulk
 * Generate N blank tokens in a batch — no students attached.
 */
export const generateBulkBlank = asyncHandler(async (req, res) => {
  const { count, notes } = validate(generateBulkBlankSchema, req.body);

  const result = await qrService.generateBulkBlankTokens({
    schoolId: req.user.school_id,
    count,
    createdBy: req.user.id,
    ipAddress: req.ip,
    notes,
  });

  return res.status(HTTP_STATUS.CREATED).json(
    new ApiResponse(
      HTTP_STATUS.CREATED,
      {
        batch: result.batch,
        tokens: result.tokens,
        summary: { generated: result.tokens.length },
      },
      `${result.tokens.length} blank token(s) generated successfully`,
    ),
  );
});

/**
 * POST /api/qr/preloaded/single
 * Generate one token pre-linked to a student — ACTIVE immediately.
 */
export const generateSinglePreloaded = asyncHandler(async (req, res) => {
  const { studentId } = validate(generateSinglePreloadedSchema, req.body);

  const result = await qrService.generateSinglePreloadedToken({
    schoolId: req.user.school_id,
    studentId,
    createdBy: req.user.id,
    ipAddress: req.ip,
  });

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      new ApiResponse(
        HTTP_STATUS.CREATED,
        result,
        "Preloaded token generated successfully",
      ),
    );
});

/**
 * POST /api/qr/preloaded/bulk
 * Generate tokens for multiple students — all ACTIVE immediately.
 * Students over token limit are skipped and reported in response.
 */
export const generateBulkPreloaded = asyncHandler(async (req, res) => {
  const { studentIds, notes } = validate(generateBulkPreloadedSchema, req.body);

  const result = await qrService.generateBulkPreloadedTokens({
    schoolId: req.user.school_id,
    studentIds,
    createdBy: req.user.id,
    ipAddress: req.ip,
    notes,
  });

  return res.status(HTTP_STATUS.CREATED).json(
    new ApiResponse(
      HTTP_STATUS.CREATED,
      {
        batch: result.batch,
        tokens: result.tokens,
        skipped: result.skipped,
        summary: result.summary,
      },
      `${result.summary.generated} token(s) generated. ${result.summary.skipped} skipped.`,
    ),
  );
});
