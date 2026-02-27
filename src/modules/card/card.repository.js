/**
 * card.repository.js
 *
 * ALL database operations for:
 *   - Card model
 *   - CardTemplate model
 *   - Student (select fields needed for card generation)
 *   - EmergencyProfile (select fields needed for card back)
 *
 * RULE: No business logic. No conditionals. No transformations.
 * Just named, typed DB queries. Service calls these — never prisma directly.
 *
 * WHY STUDENT + EMERGENCY QUERIES LIVE HERE (not in student.repository.js):
 * These are card-generation-specific projections (select only the fields
 * the card template needs). They are not general-purpose student queries.
 * Keeping them here avoids cross-module imports and keeps card module self-contained.
 */

import prisma from "../../config/prisma.js";

// =============================================================================
// CARD — CREATE
// =============================================================================

/**
 * Create a single Card record.
 * Only called for preloaded tokens (student_id required by schema).
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string} params.studentId
 * @param {string} params.tokenId
 * @param {string} params.cardNumber  - e.g. "RESQID-A4F9B2"
 * @param {string} params.fileUrl     - Storage key for combined PDF
 * @returns {Promise<Card>}
 */
export const createCard = async ({
  schoolId,
  studentId,
  tokenId,
  cardNumber,
  fileUrl,
}) => {
  return await prisma.card.create({
    data: {
      school_id: schoolId,
      student_id: studentId ?? null,
      token_id: tokenId,
      card_number: cardNumber,
      file_url: fileUrl,
      print_status: "PENDING",
    },
  });
};

/**
 * Bulk insert Card records in a single transaction.
 * Used by generateBulkCards() — inserts all cards atomically.
 *
 * WHY TRANSACTION + createMany:
 * - createMany = 1 DB round trip regardless of count (not N inserts)
 * - Transaction = all-or-nothing. Partial batch creation is worse than no creation.
 * - skipDuplicates = card_number collision (1 in 16M chance) won't crash the batch
 *
 * @param {Array<{schoolId,studentId,tokenId,cardNumber,fileUrl}>} cards
 * @returns {Promise<{ count: number }>}
 */
export const createManyCards = async (cards) => {
  return await prisma.$transaction(async (tx) => {
    return await tx.card.createMany({
      data: cards.map((c) => ({
        school_id: c.schoolId,
        student_id: c.studentId,
        token_id: c.tokenId,
        card_number: c.cardNumber,
        file_url: c.fileUrl,
        print_status: "PENDING",
      })),
      skipDuplicates: true,
    });
  });
};

// =============================================================================
// CARD — READ
// =============================================================================

/**
 * Find a card by ID scoped to a school.
 * Scoped to school_id to prevent cross-tenant data leaks.
 */
export const findCardById = async (cardId, schoolId) => {
  return await prisma.card.findFirst({
    where: { id: cardId, school_id: schoolId },
    include: { student: true, token: true },
  });
};

/**
 * Find a card by token ID.
 * Used in scan flow to check if card already exists for a token.
 */
export const findCardByTokenId = async (tokenId) => {
  return await prisma.card.findFirst({
    where: { token_id: tokenId },
  });
};

/**
 * Find all cards for a student, newest first.
 */
export const findCardsByStudentId = async (studentId) => {
  return await prisma.card.findMany({
    where: { student_id: studentId },
    orderBy: { created_at: "desc" },
  });
};

// =============================================================================
// CARD TEMPLATE — READ
// =============================================================================

/**
 * Get CardTemplate for a school.
 * Returns null if no template — service/templates handle defaults.
 */
export const findCardTemplate = async (schoolId) => {
  return await prisma.cardTemplate.findUnique({
    where: { school_id: schoolId },
  });
};

// =============================================================================
// STUDENT — card-generation projection
// =============================================================================

/**
 * Fetch only the fields needed for card back rendering (single student).
 * NOT a general-purpose student query — scoped to card generation needs only.
 *
 * @param {string} studentId
 * @returns {Promise<{ first_name, last_name, class, section, photo_url } | null>}
 */
export const findStudentForCard = async (studentId) => {
  return await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      first_name: true,
      last_name: true,
      class: true,
      section: true,
      photo_url: true,
    },
  });
};

/**
 * Fetch card-generation fields for multiple students in one query.
 * Used in bulk card generation — avoids N+1 problem.
 *
 * @param {string[]} studentIds
 * @returns {Promise<Array<{ id, first_name, last_name, class, section, photo_url }>>}
 */
export const findManyStudentsForCard = async (studentIds) => {
  return await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      class: true,
      section: true,
      photo_url: true,
    },
  });
};

// =============================================================================
// EMERGENCY PROFILE — card-generation projection
// =============================================================================

/**
 * Fetch only the fields needed for card back rendering (single student).
 * Returns null if no emergency profile exists — card back handles null gracefully.
 *
 * @param {string} studentId
 * @returns {Promise<{ blood_group, allergies, conditions } | null>}
 */
export const findEmergencyProfileForCard = async (studentId) => {
  return await prisma.emergencyProfile.findUnique({
    where: { student_id: studentId },
    select: {
      blood_group: true,
      allergies: true,
      conditions: true,
    },
  });
};

/**
 * Fetch emergency profiles for multiple students in one query.
 * Used in bulk card generation — avoids N+1 problem.
 *
 * @param {string[]} studentIds
 * @returns {Promise<Array<{ student_id, blood_group, allergies, conditions }>>}
 */
export const findManyEmergencyProfilesForCard = async (studentIds) => {
  return await prisma.emergencyProfile.findMany({
    where: { student_id: { in: studentIds } },
    select: {
      student_id: true,
      blood_group: true,
      allergies: true,
      conditions: true,
    },
  });
};

export const assignStudentToCard = async (tokenId, studentId) => {
  return await prisma.card.updateMany({
    where: { token_id: tokenId, student_id: null },
    data: { student_id: studentId },
  });
};
