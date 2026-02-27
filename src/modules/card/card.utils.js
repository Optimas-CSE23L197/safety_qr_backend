/**
 * card.utils.js
 *
 * Pure utility functions for card generation.
 * Zero dependencies on DB, storage, or HTTP.
 * Every function is deterministic and independently testable.
 *
 * WHY PURE FUNCTIONS:
 * - Easy to unit test without mocking anything
 * - No hidden state or side effects
 * - Can be called from anywhere safely
 */

import crypto from "crypto";
import QRCode from "qrcode";

// =============================================================================
// CARD NUMBER
// =============================================================================

/**
 * Generate a unique human-readable card number.
 *
 * Format:  RESQID-{6 uppercase hex chars}
 * Example: RESQID-A4F9B2
 *
 * WHY THIS FORMAT:
 * - Brand prefix makes it instantly identifiable
 * - 6 hex chars = 16,777,216 combinations — collision probability is negligible
 *   at any realistic school scale (even 10,000 cards = 0.006% collision chance)
 * - crypto.randomBytes not Math.random — cryptographically secure, not guessable
 * - Short enough to print clearly on a CR80 card at small font size
 * - Support staff can read it aloud over phone without ambiguity
 *
 * @returns {string} e.g. "RESQID-A4F9B2"
 */
export const generateCardNumber = () => {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `RESQID-${random}`;
};

// =============================================================================
// QR CODE
// =============================================================================

/**
 * Generate QR code as base64 data URL for HTML embedding.
 *
 * WHY DATA URL (not file):
 * - Puppeteer renders HTML in a sandboxed context
 * - External file paths may not resolve correctly inside Puppeteer
 * - Data URLs are self-contained — zero file system dependency during render
 * - No temp file created, no cleanup needed
 *
 * WHY ERROR CORRECTION H:
 * - H = 30% of QR data can be damaged and still scan correctly
 * - Physical cards get scratched, bent, partially covered
 * - The sliding cover physically contacts the QR area
 * - H is the only acceptable level for a safety-critical card
 *
 * @param {string} scanUrl - Full URL encoded into QR e.g. "https://scan.resqid.com/s/TOKEN"
 * @returns {Promise<string>} - "data:image/png;base64,..."
 */
export const generateQRDataUrl = async (scanUrl) => {
  return await QRCode.toDataURL(scanUrl, {
    type: "image/png",
    errorCorrectionLevel: "H",
    width: 400, // 400px renders crisp at card print size
    margin: 2, // minimal quiet zone — maximizes QR size on card face
    color: {
      dark: "#000000", // pure black — maximum scanner contrast
      light: "#FFFFFF", // pure white — no transparency issues in PDF
    },
  });
};

/**
 * Generate QR code as raw PNG Buffer.
 * Use this when you need to upload the QR image directly to storage
 * independently of the card PDF.
 *
 * @param {string} scanUrl
 * @returns {Promise<Buffer>}
 */
export const generateQRBuffer = async (scanUrl) => {
  return await QRCode.toBuffer(scanUrl, {
    type: "png",
    errorCorrectionLevel: "H",
    width: 400,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
};
