/**
 * card.service.js
 *
 * Orchestrates the full card generation pipeline.
 * Zero DB calls — all data access goes through card.repository.js.
 *
 * WHAT THIS FILE DOES:
 *   Business logic + computation only:
 *   - Generate card number + QR
 *   - Render HTML templates
 *   - Run Puppeteer (PDF generation)
 *   - Upload to storage
 *   - Coordinate repo calls (never call prisma directly)
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - No prisma.* calls
 *   - No raw SQL
 *   - No HTTP calls (that's controller responsibility)
 *
 * PIPELINE (single preloaded card):
 *   repo.findCardTemplate()         → school branding
 *   generateCardNumber()            → "RESQID-A4F9B2"
 *   generateQRDataUrl()             → base64 PNG
 *   renderCardFront/Back/Cover()    → HTML strings
 *   Puppeteer → PDF buffers
 *   mergePdfs()                     → combined front+back PDF
 *   uploadFile()                    → storage
 *   repo.createCard()               → DB record
 *   getFileUrl()                    → signed/local URL
 */

import puppeteer from "puppeteer";
import { generateCardNumber, generateQRDataUrl } from "./card.utils.js";
import {
  uploadFile,
  getFileUrl,
  StorageKeys,
  UrlExpiry,
} from "../../services/storage.service.js";
import { renderCardFront } from "../templates/cardfront.templates.js";
import { renderCardBack } from "../templates/cardback.template.js";
import { renderTopCover } from "../templates/cardtop.templates.js";
import * as cardRepo from "./card.repository.js";

// =============================================================================
// PUPPETEER HELPERS (private)
// =============================================================================

/**
 * Launch a headless Puppeteer browser.
 *
 * --no-sandbox            : Required in Docker/Linux without user namespaces
 * --disable-setuid-sandbox: Companion to no-sandbox
 * --disable-dev-shm-usage : Prevents /dev/shm OOM on low-memory servers (t2.micro etc.)
 * --disable-gpu           : Not needed for PDF rendering, reduces overhead
 */
const launchBrowser = () =>
  puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

/**
 * Render an HTML string to a PDF buffer at exact CR80 dimensions.
 *
 * networkidle0  : Waits for Google Fonts to fully load before rendering.
 *                 Without this, fonts fall back to system defaults mid-render.
 * printBackground: true : Puppeteer strips bg colors in print mode by default.
 *                         Our cards use bg colors heavily — this preserves them.
 *
 * CR80 at 96dpi:
 *   Horizontal: 85.6mm × 54mm
 *   Vertical:   54mm × 85.6mm
 *
 * @param {import('puppeteer').Page} page
 * @param {string} html
 * @param {"horizontal"|"vertical"} orientation
 * @returns {Promise<Buffer>}
 */
const renderToPdf = async (page, html, orientation = "horizontal") => {
  const isH = orientation === "horizontal";

  await page.setContent(html, { waitUntil: "networkidle0" });

  return page.pdf({
    width: isH ? "85.6mm" : "54mm",
    height: isH ? "54mm" : "85.6mm",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
};

/**
 * Merge multiple PDF buffers into one PDF document.
 *
 * WHY pdf-lib (not pdfmerge / pdftk):
 * - pdfmerge + pdftk require OS binaries → break in Docker if not pre-installed
 * - pdf-lib is pure JS → works on any platform Node.js runs on
 * - No child_process spawn → no shell injection surface
 *
 * @param {Buffer[]} buffers - PDFs to merge, in order
 * @returns {Promise<Buffer>}
 */
const mergePdfs = async (buffers) => {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }

  return Buffer.from(await merged.save());
};

// =============================================================================
// SINGLE CARD — preloaded tokens only
// =============================================================================

/**
 * Generate a complete card for a single preloaded token.
 * Called by token.service.js right after the token is saved to DB.
 *
 * Repo calls made here:
 *   cardRepo.findCardTemplate()  → school branding (null = use defaults)
 *   cardRepo.createCard()        → save Card record to DB
 *
 * The caller (token.service.js) is responsible for fetching student + emergency
 * data via repo before calling this — keeping this function focused on card gen only.
 *
 * @param {object}      params
 * @param {string}      params.schoolId
 * @param {string}      params.studentId
 * @param {string}      params.tokenId
 * @param {string}      params.scanUrl       - Full URL encoded into QR
 * @param {string}      params.batchId       - Storage path grouping; use token.id for singles
 * @param {object}      params.school        - { name, code, logo_url, phone }
 * @param {object}      params.student       - { first_name, last_name, class, section, photo_url }
 * @param {object|null} params.emergency     - { blood_group, allergies, conditions } or null
 * @param {"horizontal"|"vertical"} [params.orientation]
 *
 * @returns {Promise<{
 *   card:       object,  // DB Card record
 *   cardNumber: string,  // "RESQID-A4F9B2"
 *   fileUrl:    string,  // storage key
 *   signedUrl:  string,  // download URL (24hr in prod, local path in dev)
 * }>}
 */
export const generateCard = async ({
  schoolId,
  studentId,
  tokenId,
  scanUrl,
  batchId,
  school,
  student,
  emergency = null,
  orientation = "horizontal",
}) => {
  // ── 1. Card number + QR (pure computation — no I/O) ──────────────────────
  const cardNumber = generateCardNumber();
  const qrDataUrl = await generateQRDataUrl(scanUrl);

  // ── 2. School branding via repo (single DB call) ──────────────────────────
  const template = await cardRepo.findCardTemplate(schoolId);

  // ── 3. Render HTML for all three card faces ───────────────────────────────
  const frontHtml = renderCardFront({
    cardNumber,
    qrDataUrl,
    school,
    template,
    orientation,
  });
  const backHtml = renderCardBack({
    cardType: "preloaded",
    student,
    emergency,
    school,
    template,
    orientation,
  });
  const coverHtml = renderTopCover({ school, template, orientation });

  // ── 4. PDF generation via Puppeteer ──────────────────────────────────────
  const browser = await launchBrowser();
  let cardPdfBuffer;
  let coverPdfBuffer;

  try {
    // Open 3 pages and render all in parallel — faster than sequential
    const [frontPage, backPage, coverPage] = await Promise.all([
      browser.newPage(),
      browser.newPage(),
      browser.newPage(),
    ]);

    const [frontPdf, backPdf, cvPdf] = await Promise.all([
      renderToPdf(frontPage, frontHtml, orientation),
      renderToPdf(backPage, backHtml, orientation),
      renderToPdf(coverPage, coverHtml, orientation),
    ]);

    await Promise.all([frontPage.close(), backPage.close(), coverPage.close()]);

    // Merge front + back into one 2-page PDF
    // School admin downloads one file — page 1 = front, page 2 = back
    cardPdfBuffer = await mergePdfs([frontPdf, backPdf]);
    coverPdfBuffer = cvPdf;
  } finally {
    // ALWAYS close — leaked Puppeteer browsers consume 200-500MB RAM
    await browser.close();
  }

  // ── 5. Upload PDFs to storage ─────────────────────────────────────────────
  const cardKey = StorageKeys.cardPdf(schoolId, batchId, tokenId);
  const coverKey = StorageKeys.coverSheet(schoolId, batchId);

  await Promise.all([
    uploadFile({
      body: cardPdfBuffer,
      key: cardKey,
      contentType: "application/pdf",
      access: "private",
    }),
    uploadFile({
      body: coverPdfBuffer,
      key: coverKey,
      contentType: "application/pdf",
      access: "private",
    }),
  ]);

  // ── 6. Save Card record via repo (zero prisma here) ──────────────────────
  const card = await cardRepo.createCard({
    schoolId,
    studentId,
    tokenId,
    cardNumber,
    fileUrl: cardKey,
  });

  // ── 7. Resolve download URL ───────────────────────────────────────────────
  const signedUrl = await getFileUrl(cardKey, UrlExpiry.CARD_PDF);

  return { card, cardNumber, fileUrl: cardKey, signedUrl };
};

// =============================================================================
// BULK CARDS — batch of preloaded tokens
// =============================================================================

/**
 * Generate cards for a batch of preloaded tokens.
 *
 * Concurrency is capped at 3 (CARD_CONCURRENCY) to prevent memory exhaustion.
 * Each Puppeteer render consumes ~100-200MB RAM.
 * At concurrency 3: ~600MB peak → safe on a 1GB server.
 * Increase this only after moving to larger infrastructure.
 *
 * Repo calls made here:
 *   cardRepo.findCardTemplate()   → once per batch (not per card)
 *   cardRepo.createManyCards()    → single bulk insert after all PDFs done
 *
 * The caller (token.service.js) is responsible for fetching all student +
 * emergency data via repo before calling this, and passing it in tokenData.
 *
 * @param {object}   params
 * @param {string}   params.schoolId
 * @param {string}   params.batchId
 * @param {object}   params.school      - { name, code, logo_url, phone }
 * @param {Array<{
 *   tokenId:   string,
 *   studentId: string,
 *   scanUrl:   string,
 *   student:   object,
 *   emergency: object|null
 * }>}             params.tokenData
 * @param {"horizontal"|"vertical"} [params.orientation]
 *
 * @returns {Promise<Array<{
 *   tokenId:    string,
 *   studentId:  string,
 *   cardNumber: string,
 *   fileUrl:    string,
 *   signedUrl:  string,
 * }>>}
 */
export const generateBulkCards = async ({
  schoolId,
  batchId,
  school,
  tokenData,
  orientation = "horizontal",
}) => {
  const CARD_CONCURRENCY = 3;

  // Fetch template ONCE — reused for every card in batch
  const template = await cardRepo.findCardTemplate(schoolId);

  const results = [];

  // Process in chunks to cap memory usage
  for (let i = 0; i < tokenData.length; i += CARD_CONCURRENCY) {
    const chunk = tokenData.slice(i, i + CARD_CONCURRENCY);

    const chunkResults = await Promise.all(
      chunk.map(({ tokenId, studentId, scanUrl, student, emergency }) =>
        _renderAndUpload({
          schoolId,
          studentId,
          tokenId,
          scanUrl,
          batchId,
          school,
          student,
          emergency,
          template,
          orientation,
        }),
      ),
    );

    results.push(...chunkResults);
  }

  // Single bulk DB insert for entire batch — not N individual inserts
  await cardRepo.createManyCards(
    results.map((r) => ({
      schoolId: r.schoolId,
      studentId: r.studentId,
      tokenId: r.tokenId,
      cardNumber: r.cardNumber,
      fileUrl: r.fileUrl,
    })),
  );

  return results;
};

/**
 * Private helper — renders and uploads one card's PDFs without DB insert.
 * DB insert is deferred to generateBulkCards() for bulk efficiency.
 * Not exported — only used internally by generateBulkCards().
 */
const _renderAndUpload = async ({
  schoolId,
  studentId,
  tokenId,
  scanUrl,
  batchId,
  school,
  student,
  emergency,
  template,
  orientation,
}) => {
  const cardNumber = generateCardNumber();
  const qrDataUrl = await generateQRDataUrl(scanUrl);

  const frontHtml = renderCardFront({
    cardNumber,
    qrDataUrl,
    school,
    template,
    orientation,
  });
  const backHtml = renderCardBack({
    cardType: "preloaded",
    student,
    emergency,
    school,
    template,
    orientation,
  });

  const browser = await launchBrowser();
  let cardPdfBuffer;

  try {
    const [frontPage, backPage] = await Promise.all([
      browser.newPage(),
      browser.newPage(),
    ]);

    const [frontPdf, backPdf] = await Promise.all([
      renderToPdf(frontPage, frontHtml, orientation),
      renderToPdf(backPage, backHtml, orientation),
    ]);

    await Promise.all([frontPage.close(), backPage.close()]);
    cardPdfBuffer = await mergePdfs([frontPdf, backPdf]);
  } finally {
    await browser.close();
  }

  const fileUrl = StorageKeys.cardPdf(schoolId, batchId, tokenId);
  await uploadFile({
    body: cardPdfBuffer,
    key: fileUrl,
    contentType: "application/pdf",
    access: "private",
  });

  const signedUrl = await getFileUrl(fileUrl, UrlExpiry.CARD_PDF);

  return { schoolId, studentId, tokenId, cardNumber, fileUrl, signedUrl };
};
