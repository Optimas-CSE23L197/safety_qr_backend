import crypto from "crypto";
import { ERROR_MESSAGES, HTTP_STATUS } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import * as qrRepo from "./qr.repository.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const TOKEN_BYTE_LENGTH = 32; // 32 bytes = 256 bits entropy
const MAX_BULK_LIMIT = 1000;

if (!process.env.TOKEN_SECRET) {
  throw new Error("TOKEN_SECRET environment variable is not set");
}

if (!process.env.TOKEN_BYTE_LENGTH) {
  console.warn(
    "[QR Service] TOKEN_BYTE_LENGTH not set in env — falling back to 32 bytes",
  );
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Generate a cryptographically secure raw token.
 * Raw token is returned ONCE to the caller — never persisted in DB.
 * @returns {string} 64-char uppercase hex string (256 bits)
 */
const generateRawToken = () => {
  const byteLength =
    parseInt(process.env.TOKEN_BYTE_LENGTH, 10) || TOKEN_BYTE_LENGTH;
  return crypto.randomBytes(byteLength).toString("hex").toUpperCase();
};

/**
 * Hash the raw token using HMAC-SHA256 with TOKEN_SECRET.
 * Only the hash is stored in DB — raw token is never persisted.
 * @param {string} rawToken
 * @returns {string} hex digest
 */
const hashToken = (rawToken) => {
  return crypto
    .createHmac("sha256", process.env.TOKEN_SECRET)
    .update(rawToken)
    .digest("hex");
};

/**
 * Build the QR scan URL from a raw token.
 * This URL is what gets encoded into the QR image.
 * When scanned, frontend extracts token from URL and calls scan API.
 * @param {string} rawToken
 * @returns {string}
 */
const buildScanUrl = (rawToken) => {
  const baseUrl = process.env.SCAN_BASE_URL || "https://scan.resqid.com/s";
  return `${baseUrl}/${rawToken}`;
};

/**
 * Calculate token expiry date from school settings.
 * Falls back to 12 months if not configured.
 * @param {number} validityMonths
 * @returns {Date}
 */
const calculateExpiry = (validityMonths = 12) => {
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + validityMonths);
  return expiry;
};

/**
 * Write audit log — non-blocking.
 * Errors are caught and logged to console, never thrown.
 * Audit failure must never break the main operation.
 * @param {object} params
 */
const writeAuditLog = async (params) => {
  try {
    await qrRepo.writeLog(params);
  } catch (err) {
    console.error("[AuditLog] Failed to write:", err.message, {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
    });
  }
};

/**
 * Validate school exists and is active.
 * @param {string} schoolId
 * @returns {object} school with settings
 */
const validateSchool = async (schoolId) => {
  const school = await qrRepo.findSchoolWithSettings(schoolId);

  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  }

  if (!school.is_active) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "School account is inactive");
  }

  return school;
};

/**
 * Validate a single student belongs to the school and is active.
 * @param {string} studentId
 * @param {string} schoolId
 * @returns {object} student
 */
const validateStudent = async (studentId, schoolId) => {
  const student = await qrRepo.findStudentInSchool(studentId, schoolId);

  if (!student) {
    throw new ApiError(
      HTTP_STATUS.NOT_FOUND,
      `Student ${studentId} not found or does not belong to this school`,
    );
  }

  return student;
};

/**
 * Check student has not exceeded token limit from school settings.
 * @param {string} studentId
 * @param {number} maxTokens
 */
const checkStudentTokenLimit = async (studentId, maxTokens = 1) => {
  const activeCount = await qrRepo.countActiveTokensForStudent(studentId);

  if (activeCount >= maxTokens) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      `Student already has ${activeCount} active token(s). Revoke existing token before generating a new one.`,
    );
  }
};

// =============================================================================
// PUBLIC SERVICE FUNCTIONS
// =============================================================================

/**
 * Generate a single blank token — no student attached.
 * Status: UNASSIGNED
 * Raw token is returned once — caller encodes it into QR immediately.
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string} params.createdBy - SchoolUser ID
 * @param {string} [params.ipAddress]
 * @param {string} [params.notes]
 * @returns {{ token: object, rawToken: string, scanUrl: string }}
 */
export const generateSingleBlankToken = async ({
  schoolId,
  createdBy,
  ipAddress = null,
  notes = null,
}) => {
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const expiresAt = calculateExpiry(validityMonths);

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const scanUrl = buildScanUrl(rawToken);

  const token = await qrRepo.createToken({ schoolId, tokenHash, expiresAt });

  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    action: "GENERATE",
    entity: "Token",
    entityId: token.id,
    newValue: { status: "UNASSIGNED", expires_at: expiresAt },
    metadata: { type: "SINGLE_BLANK", notes },
    ipAddress,
  });

  return { token, rawToken, scanUrl };
};

/**
 * Generate N blank tokens in a single batch — no students attached.
 * Creates TokenBatch, then bulk-inserts all tokens atomically.
 * Uses createMany — one DB round-trip regardless of count.
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {number} params.count - how many tokens (1–1000)
 * @param {string} params.createdBy - SchoolUser ID
 * @param {string} [params.ipAddress]
 * @param {string} [params.notes]
 * @returns {{ batch: object, tokens: Array<{ tokenId, rawToken, scanUrl }> }}
 */
export const generateBulkBlankTokens = async ({
  schoolId,
  count,
  createdBy,
  ipAddress = null,
  notes = null,
}) => {
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const expiresAt = calculateExpiry(validityMonths);

  // Pre-generate all raw tokens in memory before touching DB
  const tokenData = Array.from({ length: count }, () => {
    const rawToken = generateRawToken();
    return {
      rawToken,
      tokenHash: hashToken(rawToken),
      scanUrl: buildScanUrl(rawToken),
      expiresAt,
    };
  });

  const { batch, createdTokens } = await qrRepo.createBatchWithTokens({
    schoolId,
    count,
    createdBy,
    notes,
    tokenData,
  });

  // Map raw tokens back to DB records by hash
  const hashToRaw = new Map(
    tokenData.map(({ rawToken, tokenHash, scanUrl }) => [
      tokenHash,
      { rawToken, scanUrl },
    ]),
  );

  const tokens = createdTokens.map((t) => ({
    tokenId: t.id,
    ...hashToRaw.get(t.token_hash),
  }));

  // One audit log for the entire batch — not one per token
  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    action: "GENERATE_BATCH",
    entity: "TokenBatch",
    entityId: batch.id,
    newValue: { count, status: "UNASSIGNED", expires_at: expiresAt },
    metadata: { type: "BULK_BLANK", notes },
    ipAddress,
  });

  return { batch, tokens };
};

/**
 * Generate a single token pre-linked to a student.
 * Status: ACTIVE immediately.
 * Respects max_tokens_per_student from SchoolSettings.
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string} params.studentId
 * @param {string} params.createdBy - SchoolUser ID
 * @param {string} [params.ipAddress]
 * @returns {{ token: object, rawToken: string, scanUrl: string }}
 */
export const generateSinglePreloadedToken = async ({
  schoolId,
  studentId,
  createdBy,
  ipAddress = null,
}) => {
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const maxTokens = school.settings?.max_tokens_per_student ?? 1;
  const expiresAt = calculateExpiry(validityMonths);
  const now = new Date();

  await validateStudent(studentId, schoolId);
  await checkStudentTokenLimit(studentId, maxTokens);

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const scanUrl = buildScanUrl(rawToken);

  const token = await qrRepo.createPreloadedToken({
    schoolId,
    studentId,
    tokenHash,
    expiresAt,
    now,
  });

  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    action: "GENERATE",
    entity: "Token",
    entityId: token.id,
    newValue: {
      status: "ACTIVE",
      student_id: studentId,
      expires_at: expiresAt,
    },
    metadata: { type: "SINGLE_PRELOADED" },
    ipAddress,
  });

  return { token, rawToken, scanUrl };
};

/**
 * Generate tokens for multiple students at once — all ACTIVE immediately.
 * Students over their token limit are skipped and reported separately.
 * Entire batch is atomic — if transaction fails, nothing is committed.
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string[]} params.studentIds
 * @param {string} params.createdBy - SchoolUser ID
 * @param {string} [params.ipAddress]
 * @param {string} [params.notes]
 * @returns {{ batch, tokens, skipped, summary }}
 */
export const generateBulkPreloadedTokens = async ({
  schoolId,
  studentIds,
  createdBy,
  ipAddress = null,
  notes = null,
}) => {
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const maxTokens = school.settings?.max_tokens_per_student ?? 1;
  const expiresAt = calculateExpiry(validityMonths);
  const now = new Date();

  // Validate all students belong to this school in one query
  const validStudents = await qrRepo.findStudentsInSchool(studentIds, schoolId);
  const validStudentIds = new Set(validStudents.map((s) => s.id));
  const invalidIds = studentIds.filter((id) => !validStudentIds.has(id));

  if (invalidIds.length > 0) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `The following student IDs are invalid or do not belong to this school: ${invalidIds.join(", ")}`,
    );
  }

  // Check token limits for all students in one query
  const existingCounts =
    await qrRepo.groupActiveTokenCountsByStudents(studentIds);
  const tokenCountMap = new Map(
    existingCounts.map((r) => [r.student_id, r._count.id]),
  );

  const skipped = [];
  const eligibleStudentIds = [];

  for (const studentId of studentIds) {
    const count = tokenCountMap.get(studentId) ?? 0;
    if (count >= maxTokens) {
      skipped.push({ studentId, reason: "TOKEN_LIMIT_REACHED" });
    } else {
      eligibleStudentIds.push(studentId);
    }
  }

  if (eligibleStudentIds.length === 0) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      "All students already have active tokens. No tokens generated.",
    );
  }

  // Pre-generate all raw tokens in memory
  const tokenData = eligibleStudentIds.map((studentId) => {
    const rawToken = generateRawToken();
    return {
      studentId,
      rawToken,
      tokenHash: hashToken(rawToken),
      scanUrl: buildScanUrl(rawToken),
      expiresAt,
      now,
    };
  });

  const { batch, createdTokens } = await qrRepo.createBatchWithPreloadedTokens({
    schoolId,
    count: eligibleStudentIds.length,
    createdBy,
    notes,
    tokenData,
  });

  // Map raw tokens back to DB records by hash
  const hashToData = new Map(
    tokenData.map(({ tokenHash, rawToken, scanUrl, studentId }) => [
      tokenHash,
      { rawToken, scanUrl, studentId },
    ]),
  );

  const tokens = createdTokens.map((t) => ({
    tokenId: t.id,
    studentId: t.student_id,
    ...hashToData.get(t.token_hash),
  }));

  // One audit log for the entire batch
  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    action: "GENERATE_BATCH",
    entity: "TokenBatch",
    entityId: batch.id,
    newValue: {
      count: eligibleStudentIds.length,
      status: "ACTIVE",
      expires_at: expiresAt,
    },
    metadata: { type: "BULK_PRELOADED", skipped_count: skipped.length, notes },
    ipAddress,
  });

  return {
    batch,
    tokens,
    skipped,
    summary: {
      requested: studentIds.length,
      generated: tokens.length,
      skipped: skipped.length,
    },
  };
};
