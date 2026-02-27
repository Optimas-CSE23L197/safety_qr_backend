/**
 * storage.service.js
 *
 * Handles all file storage operations.
 * Currently: saves to local /outputs folder (dev/staging mode).
 * Production swap: replace this file with S3 version — zero other code changes.
 *
 * WHY THIS INTERFACE DESIGN:
 * - All functions are async even locally — mirrors S3 API signatures exactly
 * - StorageKeys are centralized here — no hardcoded paths anywhere else in codebase
 * - getFileUrl() returns local path in dev — same call works in prod with real URLs
 * - Zero changes to card.service.js or token.service.js when switching to S3
 *
 * TO SWITCH TO S3:
 * 1. Create storage.service.s3.js with identical exports
 * 2. Update the import in whatever calls this
 * 3. Done. Nothing else changes.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../outputs");

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Save a file buffer to storage.
 *
 * @param {object} params
 * @param {Buffer|string} params.body
 * @param {string}        params.key         - e.g. "cards/school1/batch1/card.pdf"
 * @param {string}        params.contentType - kept for S3 interface compat
 * @param {"public"|"private"} params.access - kept for S3 interface compat
 * @returns {Promise<{ key: string, localPath: string }>}
 */
export const uploadFile = async ({
  body,
  key,
  contentType,
  access = "private",
}) => {
  const localPath = path.join(OUTPUT_DIR, key);
  ensureDir(localPath);
  fs.writeFileSync(localPath, body);
  return { key, localPath };
};

/**
 * Get a URL or path to access a stored file.
 * Local: returns absolute path. S3: returns pre-signed URL.
 *
 * @param {string} key
 * @param {number} expiresInSeconds - ignored locally, used in S3 mode
 * @returns {Promise<string>}
 */
export const getFileUrl = async (key, expiresInSeconds = 86400) => {
  return path.join(OUTPUT_DIR, key);
};

/**
 * Delete a file from storage.
 * @param {string} key
 */
export const deleteFile = async (key) => {
  const localPath = path.join(OUTPUT_DIR, key);
  if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
};

// =============================================================================
// STORAGE KEY BUILDERS
// =============================================================================
// WHY CENTRALIZED: If S3 folder structure ever changes,
// update here once — not scattered across 20 files.

export const StorageKeys = {
  // Combined front+back PDF for one student card (private)
  cardPdf: (schoolId, batchId, cardId) =>
    `cards/${schoolId}/${batchId}/${cardId}.pdf`,

  // Bulk print sheet — all fronts for a batch (private)
  bulkFrontSheet: (schoolId, batchId) =>
    `cards/${schoolId}/${batchId}/bulk/fronts.pdf`,

  // Bulk print sheet — all backs for a batch (private)
  bulkBackSheet: (schoolId, batchId) =>
    `cards/${schoolId}/${batchId}/bulk/backs.pdf`,

  // Top cover — one per school per batch (private)
  coverSheet: (schoolId, batchId) =>
    `cards/${schoolId}/${batchId}/bulk/cover.pdf`,

  // School logo (public)
  schoolLogo: (schoolId) => `schools/${schoolId}/logo.png`,

  // Student photo (private — signed URL required)
  studentPhoto: (schoolId, studentId) =>
    `students/${schoolId}/${studentId}/photo.jpg`,
};

// =============================================================================
// EXPIRY CONSTANTS
// =============================================================================
// Import these wherever you call getFileUrl() — never hardcode seconds.

export const UrlExpiry = {
  CARD_PDF: 60 * 60 * 24, // 24 hours
  STUDENT_PHOTO: 60 * 60, // 1 hour
  SCHOOL_LOGO: null, // public — no expiry
};
