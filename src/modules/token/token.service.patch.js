/**
 * token.service.PATCH.js
 *
 * Exact changes to apply to your existing token.service.js.
 * Do NOT rewrite the whole file — apply only these targeted patches.
 *
 * RULE ENFORCED HERE:
 * Service layer has ZERO prisma.* calls.
 * All DB access goes through a named repository function.
 *
 * Student + emergency data is fetched here in token.service.js (via cardRepo)
 * before being passed into card.service.js.
 * WHY HERE not in card.service.js:
 * card.service.js is responsible for rendering + PDF + storage.
 * Data fetching is the token service's job — it already owns the student context.
 * card.service.js receives data as params — no DB calls needed inside it
 * beyond findCardTemplate() which is card-specific.
 */

// =============================================================================
// CHANGE 1 — IMPORTS
// Add at the top of token.service.js, after existing imports
// =============================================================================

import { generateCard, generateBulkCards } from "../card/card.service.js";
import { generateCardNumber, generateQRDataUrl } from "../card/card.utils.js";
import * as cardRepo from "../card/card.repository.js";
// NOTE: Remove any direct `import prisma` if it was only used for student/emergency queries
// Keep it only if token.service.js uses prisma elsewhere (it shouldn't after this patch)

// =============================================================================
// CHANGE 2 — generateSinglePreloadedToken()
//
// FIND this line (currently the last return before closing brace):
//   return { token: sanitizeToken(token), rawToken, scanUrl };
//
// REPLACE WITH the block below.
// Note: `school`, `studentId`, `token`, `scanUrl` are already in scope above this line.
// =============================================================================

// Fetch student + emergency data via repo — zero prisma calls in service layer
const [studentData, emergencyData] = await Promise.all([
  cardRepo.findStudentForCard(studentId),
  cardRepo.findEmergencyProfileForCard(studentId),
]);

const cardResult = await generateCard({
  schoolId,
  studentId,
  tokenId: token.id,
  scanUrl,
  batchId: token.id, // single token → use token.id as storage path grouping
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

return {
  token: sanitizeToken(token),
  rawToken,
  scanUrl,
  cardNumber: cardResult.cardNumber,
  cardId: cardResult.card.id,
  cardUrl: cardResult.signedUrl,
};

// =============================================================================
// CHANGE 3 — generateBulkPreloadedTokens()
//
// FIND the existing tokens map block (builds { tokenId, studentId, rawToken, scanUrl })
// and the return statement at the end.
// REPLACE BOTH with the block below.
// Note: `batch`, `createdTokens`, `hashToData`, `eligibleStudentIds`,
//       `skipped`, `studentIds`, `school`, `schoolId` are all already in scope.
// =============================================================================

// Fetch all students + emergency profiles in 2 queries — not N
// WHY 2 queries: avoids N+1 problem critical in bulk operations (500 tokens = 1000 queries vs 2)
const [allStudents, allEmergencyProfiles] = await Promise.all([
  cardRepo.findManyStudentsForCard(eligibleStudentIds),
  cardRepo.findManyEmergencyProfilesForCard(eligibleStudentIds),
]);

// O(1) lookup maps — used inside the map() below
const studentMap = new Map(allStudents.map((s) => [s.id, s]));
const emergencyMap = new Map(
  allEmergencyProfiles.map((e) => [e.student_id, e]),
);

// Build tokenData array — matches what generateBulkCards() expects
const tokenData = createdTokens.map((t) => {
  const data = hashToData.get(t.token_hash);
  if (!data) throw new Error(`[TokenService] Hash mismatch for token ${t.id}`);

  return {
    tokenId: t.id,
    studentId: t.student_id,
    scanUrl: data.scanUrl,
    rawToken: data.rawToken,
    student: studentMap.get(t.student_id) ?? null,
    emergency: emergencyMap.get(t.student_id) ?? null,
  };
});

// Generate all cards — concurrency capped at 3 inside generateBulkCards()
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

// ← your existing writeAuditLog() call stays here, unchanged ←

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

// =============================================================================
// CHANGE 4 — generateSingleBlankToken()
//
// Blank tokens: no DB Card record (student_id required by schema).
// Generate cardNumber + QR for physical card printing only.
//
// FIND:
//   return { token: sanitizeToken(token), rawToken, scanUrl };
//
// REPLACE WITH:
// =============================================================================

// No DB calls needed for blank cards
// generateCardNumber() and generateQRDataUrl() are pure functions
const blankCardNumber = generateCardNumber();
const blankQrDataUrl = await generateQRDataUrl(scanUrl);

return {
  token: sanitizeToken(token),
  rawToken,
  scanUrl,
  cardNumber: blankCardNumber, // print on physical card face
  qrDataUrl: blankQrDataUrl, // embed in card front template
  // cardId: null — DB Card record created when student is assigned to this token
};

// =============================================================================
// CHANGE 5 — generateBulkBlankTokens()
//
// Same as CHANGE 4 but for each token in the batch.
//
// FIND the existing tokens map:
//   const tokens = createdTokens.map((t) => {
//     ...
//     return { tokenId: t.id, ...data };
//   });
//
// REPLACE WITH:
// NOTE: Check your actual Map variable name (may not be hashToScanUrlMap)
// =============================================================================

// Generate cardNumber + QR per token — pure computation, no DB calls
const tokens = await Promise.all(
  createdTokens.map(async (t) => {
    const data = hashToScanUrlMap.get(t.token_hash); // ← adjust to your actual variable name
    if (!data)
      throw new Error(`[TokenService] Hash mismatch for token ${t.id}`);

    return {
      tokenId: t.id,
      rawToken: data.rawToken,
      scanUrl: data.scanUrl,
      cardNumber: generateCardNumber(),
      qrDataUrl: await generateQRDataUrl(data.scanUrl),
    };
  }),
);

// =============================================================================
// FINAL RESPONSE SHAPES (for reference)
// =============================================================================

/*
  generateSingleBlankToken():
  {
    token,        // sanitized DB record
    rawToken,     // show once — never store
    scanUrl,
    cardNumber,   // "RESQID-A4F9B2" — print on physical card
    qrDataUrl,    // base64 PNG — embed in card front
  }

  generateBulkBlankTokens():
  {
    batch,
    tokens: [{ tokenId, rawToken, scanUrl, cardNumber, qrDataUrl }],
    skipped,
    summary: { requested, generated, skipped }
  }

  generateSinglePreloadedToken():
  {
    token,
    rawToken,
    scanUrl,
    cardNumber,   // "RESQID-A4F9B2"
    cardId,       // DB Card.id
    cardUrl,      // signed download URL (24hr)
  }

  generateBulkPreloadedTokens():
  {
    batch,
    tokens: [{ tokenId, studentId, rawToken, scanUrl, cardNumber, cardUrl }],
    skipped,
    summary: { requested, generated, skipped }
  }
*/

// =============================================================================
// PACKAGES TO INSTALL
// npm install qrcode puppeteer pdf-lib
// =============================================================================
