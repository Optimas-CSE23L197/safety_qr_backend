import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
} from "crypto";

// =============================================================================
// AES-256-GCM Encryption Utility
//
// Used to encrypt/decrypt fields marked [ENCRYPTED] in the schema.
//
// Format of stored ciphertext (base64-encoded):
//   [12-byte IV][16-byte auth tag][N-byte ciphertext]
//
// Why GCM?
// - Provides authenticated encryption (detects tampering)
// - Auth tag means a corrupted or tampered ciphertext will fail to decrypt
//   rather than silently returning garbage data
// =============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY env variable is required");

// Key must be 32 bytes for AES-256
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, "hex");
if (KEY_BUFFER.length !== 32) {
  throw new Error(
    "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
  );
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string safe for storage in a text DB column.
 *
 * @param {string} plaintext
 * @returns {string} base64-encoded ciphertext
 */
export const encrypt = (plaintext) => {
  if (!plaintext) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY_BUFFER, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: IV + authTag + ciphertext → base64
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
};

/**
 * Decrypt a base64-encoded ciphertext string.
 *
 * @param {string} ciphertext - base64-encoded
 * @returns {string} plaintext
 */
export const decrypt = (ciphertext) => {
  if (!ciphertext) return ciphertext;

  const buf = Buffer.from(ciphertext, "base64");

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, KEY_BUFFER, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
};

/**
 * Generate a blind index for searching encrypted fields.
 * Use this for phone numbers, emails — fields you need to look up
 * without decrypting every row.
 *
 * @param {string} value - normalized plaintext (e.g. E.164 phone)
 * @returns {string} hex HMAC
 */
export const blindIndex = (value) => {
  if (!value) return null;

  const secret = process.env.PHONE_INDEX_SECRET;

  if (!secret) {
    throw new Error("PHONE_INDEX_SECRET environment variable is required");
  }

  return createHmac("sha256", secret)
    .update(value.toLowerCase().trim())
    .digest("hex");
};
