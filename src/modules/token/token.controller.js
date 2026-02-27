import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { HTTP_STATUS } from "../../config/constants.js";
import * as qrService from "./token.service.js";
import {
  generateSingleBlankSchema,
  generateBulkBlankSchema,
  generateSinglePreloadedSchema,
  generateBulkPreloadedSchema,
} from "./token.validation.js";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Validate request body against a Zod schema.
 * Throws ApiError with 400 on validation failure.
 */
const validate = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors.map((e) => e.message).join(", ");
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, messages);
  }
  return result.data;
};

/**
 * Resolve schoolId based on actor type.
 *
 * - actorType "school"      → pulled from auth context (req.user.school_id)
 *                             SchoolUser is always tenant-scoped — body.schoolId ignored
 * - actorType "super_admin" → must provide schoolId in request body
 *                             SuperAdmin is cross-tenant — no implicit school scope
 *
 * Any other actorType (parent, unknown) is hard-rejected with 403.
 *
 * @param {object} user       - req.user set by requireAuth middleware
 * @param {object} body       - validated request body (post-Zod parse)
 * @returns {string}          - resolved schoolId (UUID)
 */
const resolveSchoolId = (user, body) => {
  if (user.actorType === "school") {
    return user.school_id;
  }

  if (user.actorType === "super_admin") {
    if (!body.schoolId) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        "schoolId is required in request body for super admin operations",
      );
    }
    return body.schoolId;
  }

  throw new ApiError(
    HTTP_STATUS.FORBIDDEN,
    "You do not have permission to perform this action",
  );
};

/**
 * Map actorType string from JWT to ActorType enum in DB.
 * Must match the ActorType enum in schema.prisma exactly:
 *   SUPER_ADMIN | SCHOOL_USER | PARENT_USER | SYSTEM
 *
 * @param {string} actorType - from req.user.actorType
 * @returns {string}         - ActorType enum value
 */
const resolveActorType = (actorType) => {
  const map = {
    super_admin: "SUPER_ADMIN",
    school: "SCHOOL_USER",
    parent: "PARENT_USER",
  };
  return map[actorType] ?? "SYSTEM";
};

// =============================================================================
// CONTROLLERS
// =============================================================================

/**
 * POST /api/qr/blank/single
 * Generate one blank token — no student attached.
 *
 * Body (school user):   { notes? }
 * Body (super admin):   { schoolId, notes? }
 */
export const generateSingleBlank = asyncHandler(async (req, res) => {
  const { notes, schoolId: bodySchoolId } = validate(
    generateSingleBlankSchema,
    req.body,
  );

  const schoolId = resolveSchoolId(req.user, { schoolId: bodySchoolId });
  const actorType = resolveActorType(req.user.actorType);

  const result = await qrService.generateSingleBlankToken({
    schoolId,
    createdBy: req.user.id,
    actorType,
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
 *
 * Body (school user):   { count, notes? }
 * Body (super admin):   { schoolId, count, notes? }
 */
export const generateBulkBlank = asyncHandler(async (req, res) => {
  const {
    count,
    notes,
    schoolId: bodySchoolId,
  } = validate(generateBulkBlankSchema, req.body);

  const schoolId = resolveSchoolId(req.user, { schoolId: bodySchoolId });
  const actorType = resolveActorType(req.user.actorType);

  const result = await qrService.generateBulkBlankTokens({
    schoolId,
    count,
    createdBy: req.user.id,
    actorType,
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
 *
 * Body (school user):   { studentId }
 * Body (super admin):   { schoolId, studentId }
 */
export const generateSinglePreloaded = asyncHandler(async (req, res) => {
  const { studentId, schoolId: bodySchoolId } = validate(
    generateSinglePreloadedSchema,
    req.body,
  );

  const schoolId = resolveSchoolId(req.user, { schoolId: bodySchoolId });
  const actorType = resolveActorType(req.user.actorType);

  const result = await qrService.generateSinglePreloadedToken({
    schoolId,
    studentId,
    createdBy: req.user.id,
    actorType,
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
 *
 * Body (school user):   { studentIds, notes? }
 * Body (super admin):   { schoolId, studentIds, notes? }
 */
export const generateBulkPreloaded = asyncHandler(async (req, res) => {
  const {
    studentIds,
    notes,
    schoolId: bodySchoolId,
  } = validate(generateBulkPreloadedSchema, req.body);

  const schoolId = resolveSchoolId(req.user, { schoolId: bodySchoolId });
  const actorType = resolveActorType(req.user.actorType);

  const result = await qrService.generateBulkPreloadedTokens({
    schoolId,
    studentIds,
    createdBy: req.user.id,
    actorType,
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
