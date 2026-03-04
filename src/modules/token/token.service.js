import crypto from "crypto";
import { HTTP_STATUS } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import * as tokenRepo from "./token.repository.js";
import { sanitizeToken } from "../../utils/helper.js";
import { generateCard, generateBulkCards } from "../card/card.service.js";
import * as cardRepo from "../card/card.repository.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const TOKEN_BYTE_LENGTH = 32; // 32 bytes = 256 bits entropy
const MAX_BULK_LIMIT = 1000;

// FIX BUG 1 (label): warn label was "[QR Service]" — this is token.service.js
if (!process.env.TOKEN_SECRET) {
  throw new Error("TOKEN_SECRET environment variable is not set");
}

if (!process.env.TOKEN_BYTE_LENGTH) {
  console.warn(
    "[Token Service] TOKEN_BYTE_LENGTH not set in env — falling back to 32 bytes",
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
 *
 * NOTE: Uses date-safe calculation — sets day to 1 before month addition
 * to avoid month overflow (e.g. Jan 31 + 1 month = Feb 28, not Mar 3).
 *
 * @param {number} validityMonths
 * @returns {Date}
 */
const calculateExpiry = (validityMonths = 12) => {
  const expiry = new Date();
  const currentDay = expiry.getDate();
  expiry.setDate(1); // anchor to 1st to avoid overflow
  expiry.setMonth(expiry.getMonth() + validityMonths);
  // Restore original day clamped to last day of target month
  const maxDay = new Date(
    expiry.getFullYear(),
    expiry.getMonth() + 1,
    0,
  ).getDate();
  expiry.setDate(Math.min(currentDay, maxDay));
  return expiry;
};

/**
 * Write audit log — non-blocking, fire-and-forget.
 * Errors are caught and logged to console, never thrown.
 * Audit failure must NEVER break the main operation.
 *
 * Maps directly to AuditLog model in schema.prisma:
 *   id, action, entity, entity_id, metadata, created_at,
 *   actor_id, actor_type (ActorType enum), ip_address,
 *   new_value, old_value, school_id
 *
 * ActorType enum values: SUPER_ADMIN | SCHOOL_USER | PARENT_USER | SYSTEM
 *
 * @param {object} params
 */
const writeAuditLog = async (params) => {
  try {
    await tokenRepo.writeLog(params);
  } catch (err) {
    console.error("[AuditLog] Failed to write:", err.message, {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      actorId: params.actorId,
      actorType: params.actorType,
    });
  }
};

/**
 * Validate school exists and is active.
 * @param {string} schoolId
 * @returns {object} school with settings
 */
const validateSchool = async (schoolId) => {
  const school = await tokenRepo.findSchoolWithSettings(schoolId);

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
  const student = await tokenRepo.findStudentInSchool(studentId, schoolId);

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
  const activeCount = await tokenRepo.countActiveTokensForStudent(studentId);

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
 *
 * Flow:
 *   1. Validate school
 *   2. Create token in DB (UNASSIGNED)
 *   3. Generate blank card PDF → upload to S3 → create Card DB record
 *   4. Write audit log (AFTER card generation succeeds)
 *   5. Return token + card details
 *
 * WHY audit log is AFTER generateCard():
 *   If card generation fails (S3 down, Puppeteer crash), audit log must NOT
 *   record a successful GENERATE. Logging before meant a false success trail.
 *   BUG FIX: moved audit log to after generateCard() returns.
 *
 * Audit log fields stored:
 *   - actor_id    → createdBy (SchoolUser.id or SuperAdmin.id)
 *   - actor_type  → SCHOOL_USER or SUPER_ADMIN (ActorType enum)
 *   - action      → "GENERATE"
 *   - entity      → "Token"
 *   - entity_id   → token.id
 *   - school_id   → schoolId
 *   - new_value   → { status, expires_at, card_number, card_id }
 *   - metadata    → { type, notes }
 *   - ip_address  → caller IP
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string} params.createdBy     - SchoolUser.id or SuperAdmin.id
 * @param {string} params.actorType     - ActorType enum: "SCHOOL_USER" | "SUPER_ADMIN"
 * @param {string} [params.ipAddress]
 * @param {string} [params.notes]
 * @returns {{ token, rawToken, scanUrl, cardNumber, cardId, cardUrl }}
 */
export const generateSingleBlankToken = async ({
  schoolId,
  createdBy,
  actorType,
  ipAddress = null,
  notes = null,
}) => {
  // ── 1. Validate school ────────────────────────────────────────────────────
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const expiresAt = calculateExpiry(validityMonths);

  // ── 2. Generate token credentials ─────────────────────────────────────────
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const scanUrl = buildScanUrl(rawToken);

  // ── 3. Save token to DB ───────────────────────────────────────────────────
  const token = await tokenRepo.createToken({ schoolId, tokenHash, expiresAt });

  // ── 4. Generate blank card PDF → S3 → Card DB record ─────────────────────
  // FIX BUG 2: removed dead-code blankCardNumber + blankQrDataUrl that were
  // generated here but never used (generateCard() generates its own internally).
  // FIX BUG 10: audit log moved to AFTER this succeeds (was before, causing
  // false-success audit entries when card generation failed).
  const blankCardResult = await generateCard({
    schoolId,
    studentId: null, // null = blank card — no student yet
    tokenId: token.id,
    scanUrl,
    batchId: token.id, // singles use token.id as their own batchId
    school: {
      name: school.name,
      code: school.code,
      logo_url: school.logo_url ?? null,
      phone: school.phone ?? null,
    },
    student: null, // null = blank back (how to use + first aid)
    emergency: null,
    orientation: "horizontal",
  });

  // ── 5. Audit log — only fires after card generation succeeds ──────────────
  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    actorType,
    action: "GENERATE",
    entity: "Token",
    entityId: token.id,
    oldValue: null,
    newValue: {
      status: "UNASSIGNED",
      expires_at: expiresAt,
      card_number: blankCardResult.cardNumber,
      card_id: blankCardResult.card.id,
    },
    metadata: {
      type: "SINGLE_BLANK",
      notes,
    },
    ipAddress,
  });

  return {
    token: sanitizeToken(token),
    rawToken,
    scanUrl,
    cardNumber: blankCardResult.cardNumber,
    cardId: blankCardResult.card.id,
    cardUrl: blankCardResult.signedUrl, // signed S3 URL, 24hr expiry
  };
};

/**
 * Generate N blank tokens in a single batch — no students attached.
 * Creates TokenBatch, then bulk-inserts all tokens atomically.
 *
 * Flow:
 *   1. Validate school
 *   2. FIX: enforce MAX_BULK_LIMIT
 *   3. FIX: pre-generate rawTokenData IN MEMORY first (was missing entirely)
 *   4. Create TokenBatch + all tokens in DB atomically
 *   5. Build hashToRaw map from rawTokenData (not createdTokens)
 *   6. Build tokenData for generateBulkCards()
 *   7. Generate all blank card PDFs → S3 → Card DB records
 *   8. Write audit log
 *   9. Return batch + tokens
 *
 * WHY rawTokenData must be generated BEFORE the repo call:
 *   Token hashes are stored in DB. To map DB records back to raw tokens
 *   after insert, you need the hash→rawToken map in memory first.
 *   BUG FIX: this entire block was missing — tokenData was used before
 *   declaration, causing guaranteed ReferenceError on every call.
 *
 * Audit log fields stored:
 *   - actor_id    → createdBy
 *   - actor_type  → SCHOOL_USER or SUPER_ADMIN
 *   - action      → "GENERATE_BATCH"
 *   - entity      → "TokenBatch"
 *   - entity_id   → batch.id
 *   - school_id   → schoolId
 *   - new_value   → { count, status, expires_at }
 *   - metadata    → { type, notes }
 *   - ip_address  → caller IP
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {number} params.count
 * @param {string} params.createdBy
 * @param {string} params.actorType     - ActorType enum
 * @param {string} [params.ipAddress]
 * @param {string} [params.notes]
 * @returns {{ batch, tokens: Array<{ tokenId, rawToken, scanUrl, cardNumber, cardUrl }> }}
 */
export const generateBulkBlankTokens = async ({
  schoolId,
  count,
  createdBy,
  actorType,
  ipAddress = null,
  notes = null,
}) => {
  // ── 1. Validate school ────────────────────────────────────────────────────
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const expiresAt = calculateExpiry(validityMonths);

  // ── 2. Enforce bulk limit ─────────────────────────────────────────────────
  // FIX BUG 8: MAX_BULK_LIMIT was declared but never checked.
  // Without this, count: 99999 would attempt 99999 Puppeteer renders → OOM crash.
  if (count < 1 || !Number.isInteger(count)) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      "count must be a positive integer",
    );
  }

  if (count > MAX_BULK_LIMIT) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `Bulk limit is ${MAX_BULK_LIMIT} tokens per request. Received: ${count}`,
    );
  }

  // ── 3. Pre-generate ALL raw tokens in memory before touching DB ───────────
  // FIX BUG (CRITICAL): This entire block was missing in the previous version.
  // tokenData was referenced on line 309 but only declared on line 320 → ReferenceError.
  // Raw tokens must exist in memory BEFORE the repo call so we can:
  //   (a) pass tokenHashes to the repo for DB insert
  //   (b) build hashToRaw map to recover rawToken after DB returns records
  const rawTokenData = Array.from({ length: count }, () => {
    const rawToken = generateRawToken();
    return {
      rawToken,
      tokenHash: hashToken(rawToken),
      scanUrl: buildScanUrl(rawToken),
      expiresAt,
    };
  });

  // ── 4. Create TokenBatch + all tokens atomically in DB ────────────────────
  const { batch, createdTokens } = await tokenRepo.createBatchWithTokens({
    schoolId,
    count,
    createdBy,
    notes,
    tokenData: rawTokenData, // pass rawTokenData — not the undefined tokenData
  });

  // ── 5. Build hash → { rawToken, scanUrl } lookup map ─────────────────────
  // Keys are token_hash values that DB returned — values are in-memory raw tokens.
  // O(1) lookup used in the map() below instead of nested find().
  const hashToRaw = new Map(
    rawTokenData.map(({ rawToken, tokenHash, scanUrl }) => [
      tokenHash,
      { rawToken, scanUrl },
    ]),
  );

  // ── 6. Build tokenData for generateBulkCards() ────────────────────────────
  const tokenData = createdTokens.map((t) => {
    const data = hashToRaw.get(t.token_hash);
    if (!data) {
      throw new Error(
        `[Token Service] Hash mismatch for token ${t.id} — raw token not found in memory map`,
      );
    }
    return {
      tokenId: t.id,
      studentId: null, // blank — no student attached
      scanUrl: data.scanUrl,
      rawToken: data.rawToken,
      student: null, // blank back = how to use + first aid
      emergency: null,
    };
  });

  // ── 7. Generate all blank card PDFs → S3 → Card DB records ───────────────
  // Concurrency capped at 3 inside generateBulkCards() — ~600MB peak RAM.
  const cardResults = await generateBulkCards({
    schoolId,
    batchId: batch.id,
    school: {
      name: school.name,
      code: school.code,
      logo_url: school.logo_url ?? null,
      phone: school.phone ?? null,
    },
    tokenData,
    orientation: "horizontal",
  });

  // ── 8. Map cardResults back to tokens by tokenId ──────────────────────────
  const cardByTokenId = new Map(cardResults.map((c) => [c.tokenId, c]));

  const tokens = tokenData.map((td) => {
    const card = cardByTokenId.get(td.tokenId);
    return {
      tokenId: td.tokenId,
      rawToken: td.rawToken,
      scanUrl: td.scanUrl,
      cardNumber: card?.cardNumber ?? null,
      cardUrl: card?.signedUrl ?? null, // signed S3 URL per card
    };
  });

  // ── 9. Audit log — after everything succeeds ──────────────────────────────
  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    actorType,
    action: "GENERATE_BATCH",
    entity: "TokenBatch",
    entityId: batch.id,
    oldValue: null,
    newValue: {
      count,
      status: "UNASSIGNED",
      expires_at: expiresAt,
    },
    metadata: {
      type: "BULK_BLANK",
      notes,
    },
    ipAddress,
  });

  return { batch, tokens };
};

/**
 * Generate a single token pre-linked to a student.
 * Status: ACTIVE immediately — no registration step needed.
 * Respects max_tokens_per_student from SchoolSettings.
 *
 * Flow:
 *   1. Validate school + student + token limit
 *   2. Create token in DB (ACTIVE, assigned_at + activated_at set)
 *   3. Fetch student + emergency data (card repo — 2 parallel queries)
 *   4. Generate preloaded card PDF → S3 → Card DB record
 *   5. Write audit log (AFTER card generation succeeds)
 *   6. Return token + card details
 *
 * Audit log fields stored:
 *   - actor_id    → createdBy
 *   - actor_type  → SCHOOL_USER or SUPER_ADMIN
 *   - action      → "GENERATE"
 *   - entity      → "Token"
 *   - entity_id   → token.id
 *   - school_id   → schoolId
 *   - new_value   → { status, student_id, expires_at, assigned_at, activated_at, card_number, card_id }
 *   - metadata    → { type }
 *   - ip_address  → caller IP
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string} params.studentId
 * @param {string} params.createdBy
 * @param {string} params.actorType     - ActorType enum
 * @param {string} [params.ipAddress]
 * @returns {{ token, rawToken, scanUrl, cardNumber, cardId, cardUrl }}
 */
export const generateSinglePreloadedToken = async ({
  schoolId,
  studentId,
  createdBy,
  actorType,
  ipAddress = null,
}) => {
  // ── 1. Validate school + student + token limit ────────────────────────────
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const maxTokens = school.settings?.max_tokens_per_student ?? 1;
  const expiresAt = calculateExpiry(validityMonths);
  const now = new Date();

  await validateStudent(studentId, schoolId);
  await checkStudentTokenLimit(studentId, maxTokens);

  // ── 2. Generate token credentials ─────────────────────────────────────────
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const scanUrl = buildScanUrl(rawToken);

  // ── 3. Save token to DB (ACTIVE immediately) ──────────────────────────────
  const token = await tokenRepo.createPreloadedToken({
    schoolId,
    studentId,
    tokenHash,
    expiresAt,
    now,
  });

  // ── 4. Fetch student + emergency in parallel — 2 queries total ────────────
  // WHY parallel: independent queries, no dependency between them.
  // WHY card repo (not student repo): card-generation-specific field projections.
  const [studentData, emergencyData] = await Promise.all([
    cardRepo.findStudentForCard(studentId),
    cardRepo.findEmergencyProfileForCard(studentId),
  ]);

  // ── 5. Generate preloaded card PDF → S3 → Card DB record ─────────────────
  const cardResult = await generateCard({
    schoolId,
    studentId,
    tokenId: token.id,
    scanUrl,
    batchId: token.id,
    school: {
      name: school.name,
      code: school.code,
      logo_url: school.logo_url ?? null,
      phone: school.phone ?? null,
    },
    student: studentData,
    emergency: emergencyData ?? null,
    orientation: "horizontal",
  });

  // ── 6. Audit log — only fires after card generation succeeds ──────────────
  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    actorType,
    action: "GENERATE",
    entity: "Token",
    entityId: token.id,
    oldValue: null,
    newValue: {
      status: "ACTIVE",
      student_id: studentId,
      expires_at: expiresAt,
      assigned_at: now,
      activated_at: now,
      card_number: cardResult.cardNumber,
      card_id: cardResult.card.id,
    },
    metadata: {
      type: "SINGLE_PRELOADED",
    },
    ipAddress,
  });

  return {
    token: sanitizeToken(token),
    rawToken,
    scanUrl,
    cardNumber: cardResult.cardNumber,
    cardId: cardResult.card.id,
    cardUrl: cardResult.signedUrl,
  };
};

/**
 * Generate tokens for multiple students at once — all ACTIVE immediately.
 * Students over their token limit are skipped and reported separately.
 * Entire batch is atomic — if transaction fails, nothing is committed.
 *
 * Flow:
 *   1. Validate school
 *   2. FIX: enforce MAX_BULK_LIMIT
 *   3. Deduplicate + validate all student IDs in 1 query
 *   4. Check token limits for all students in 1 query — build eligible list
 *   5. Pre-generate rawTokenData in memory
 *   6. Create TokenBatch + all tokens atomically in DB
 *   7. Fetch all students + emergency profiles in 2 queries (not N)
 *   8. Build tokenData for generateBulkCards()
 *   9. Generate all preloaded card PDFs → S3 → Card DB records
 *   10. Write audit log
 *   11. Return batch + tokens + skipped + summary
 *
 * Audit log fields stored:
 *   - actor_id    → createdBy
 *   - actor_type  → SCHOOL_USER or SUPER_ADMIN
 *   - action      → "GENERATE_BATCH"
 *   - entity      → "TokenBatch"
 *   - entity_id   → batch.id
 *   - school_id   → schoolId
 *   - new_value   → { count, status, expires_at, student_ids }
 *   - metadata    → { type, notes, skipped_count, skipped_students }
 *                    skipped_students: [{ studentId, reason }]
 *                    reason values: "TOKEN_LIMIT_REACHED"
 *   - ip_address  → caller IP
 *
 * @param {object}   params
 * @param {string}   params.schoolId
 * @param {string[]} params.studentIds
 * @param {string}   params.createdBy
 * @param {string}   params.actorType   - ActorType enum
 * @param {string}   [params.ipAddress]
 * @param {string}   [params.notes]
 * @returns {{ batch, tokens, skipped, summary }}
 */
export const generateBulkPreloadedTokens = async ({
  schoolId,
  studentIds,
  createdBy,
  actorType,
  ipAddress = null,
  notes = null,
}) => {
  // ── 1. Validate school ────────────────────────────────────────────────────
  const school = await validateSchool(schoolId);
  const validityMonths = school.settings?.token_validity_months ?? 12;
  const maxTokens = school.settings?.max_tokens_per_student ?? 1;
  const expiresAt = calculateExpiry(validityMonths);
  const now = new Date();

  // ── 2. Enforce bulk limit ─────────────────────────────────────────────────
  // FIX BUG 8: MAX_BULK_LIMIT was declared but never enforced anywhere.
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      "studentIds must be a non-empty array",
    );
  }

  if (studentIds.length > MAX_BULK_LIMIT) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `Bulk limit is ${MAX_BULK_LIMIT} tokens per request. Received: ${studentIds.length}`,
    );
  }

  // ── 3. Deduplicate + validate all student IDs in 1 query ─────────────────
  // Deduplication prevents: same student appearing twice → bypasses maxTokens guard.
  const uniqueStudentIds = [...new Set(studentIds)];

  const validStudents = await tokenRepo.findStudentsInSchool(
    uniqueStudentIds,
    schoolId,
  );
  const validStudentIds = new Set(validStudents.map((s) => s.id));
  const invalidIds = uniqueStudentIds.filter((id) => !validStudentIds.has(id));

  if (invalidIds.length > 0) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      `The following student IDs are invalid or do not belong to this school: ${invalidIds.join(", ")}`,
    );
  }

  // ── 4. Check token limits for all students in 1 query ────────────────────
  const existingCounts =
    await tokenRepo.groupActiveTokenCountsByStudents(uniqueStudentIds);
  const tokenCountMap = new Map(
    existingCounts.map((r) => [r.student_id, r._count.id]),
  );

  const skipped = [];
  const eligibleStudentIds = [];

  for (const studentId of uniqueStudentIds) {
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

  // ── 5. Pre-generate all raw tokens in memory before touching DB ───────────
  const rawTokenData = eligibleStudentIds.map((studentId) => {
    const rawToken = generateRawToken();
    return {
      studentId,
      rawToken,
      tokenHash: hashToken(rawToken),
      scanUrl: buildScanUrl(rawToken),
      expiresAt,
    };
  });

  // Map hash → { rawToken, scanUrl, studentId } for O(1) lookup after DB insert
  const hashToData = new Map(
    rawTokenData.map(({ tokenHash, rawToken, scanUrl, studentId }) => [
      tokenHash,
      { rawToken, scanUrl, studentId },
    ]),
  );

  // ── 6. Create TokenBatch + all tokens atomically in DB ────────────────────
  const { batch, createdTokens } =
    await tokenRepo.createBatchWithPreloadedTokens({
      schoolId,
      count: eligibleStudentIds.length,
      createdBy,
      notes,
      tokenData: rawTokenData,
    });

  // ── 7. Fetch all students + emergency profiles in 2 parallel queries ───────
  // WHY 2 queries not N: 500 students = 2 queries vs 1000 queries — critical at scale.
  // WHY card repo: card-generation-specific projections, not general student queries.
  const [allStudents, allEmergencyProfiles] = await Promise.all([
    cardRepo.findManyStudentsForCard(eligibleStudentIds),
    cardRepo.findManyEmergencyProfilesForCard(eligibleStudentIds),
  ]);

  const studentMap = new Map(allStudents.map((s) => [s.id, s]));
  const emergencyMap = new Map(
    allEmergencyProfiles.map((e) => [e.student_id, e]),
  );

  // ── 8. Build tokenData array for generateBulkCards() ─────────────────────
  const tokenData = createdTokens.map((t) => {
    const data = hashToData.get(t.token_hash);
    if (!data) {
      throw new Error(
        `[Token Service] Hash mismatch for token ${t.id} — raw token not found in memory map`,
      );
    }
    return {
      tokenId: t.id,
      studentId: t.student_id,
      scanUrl: data.scanUrl,
      rawToken: data.rawToken,
      student: studentMap.get(t.student_id) ?? null,
      emergency: emergencyMap.get(t.student_id) ?? null,
    };
  });

  // ── 9. Generate all preloaded card PDFs → S3 → Card DB records ───────────
  // Concurrency capped at 3 inside generateBulkCards() — ~600MB peak RAM.
  const cardResults = await generateBulkCards({
    schoolId,
    batchId: batch.id,
    school: {
      name: school.name,
      code: school.code,
      logo_url: school.logo_url ?? null,
      phone: school.phone ?? null,
    },
    tokenData,
    orientation: "horizontal",
  });

  const cardByTokenId = new Map(cardResults.map((c) => [c.tokenId, c]));

  const tokens = tokenData.map((td) => {
    const card = cardByTokenId.get(td.tokenId);
    return {
      tokenId: td.tokenId,
      studentId: td.studentId,
      rawToken: td.rawToken,
      scanUrl: td.scanUrl,
      cardNumber: card?.cardNumber ?? null,
      cardUrl: card?.signedUrl ?? null,
    };
  });

  // ── 10. Audit log — after everything succeeds ─────────────────────────────
  await writeAuditLog({
    schoolId,
    actorId: createdBy,
    actorType,
    action: "GENERATE_BATCH",
    entity: "TokenBatch",
    entityId: batch.id,
    oldValue: null,
    newValue: {
      count: eligibleStudentIds.length,
      status: "ACTIVE",
      expires_at: expiresAt,
      student_ids: eligibleStudentIds, // exact list of who got tokens
    },
    metadata: {
      type: "BULK_PRELOADED",
      notes,
      skipped_count: skipped.length,
      skipped_students: skipped, // [{ studentId, reason }]
    },
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
