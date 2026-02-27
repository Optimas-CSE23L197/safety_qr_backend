import prisma from "../../config/prisma.js";

// =============================================================================
// AUDIT LOG
// =============================================================================

export const writeLog = async ({
  schoolId,
  actorId,
  actorType = "SCHOOL_USER",
  action,
  entity,
  entityId,
  oldValue = null,
  newValue = null,
  metadata = null,
  ipAddress = null,
}) => {
  return await prisma.auditLog.create({
    data: {
      school_id: schoolId,
      actor_type: actorType,
      actor_id: actorId,
      action,
      entity,
      entity_id: entityId,
      old_value: oldValue,
      new_value: newValue,
      metadata,
      ip_address: ipAddress,
    },
  });
};

// =============================================================================
// SINGLE BLANK TOKEN
// =============================================================================

export const createToken = async ({ schoolId, tokenHash, expiresAt }) => {
  return await prisma.token.create({
    data: {
      school_id: schoolId,
      token_hash: tokenHash,
      status: "UNASSIGNED",
      expires_at: expiresAt,
    },
  });
};

// =============================================================================
// BULK BLANK TOKENS
// =============================================================================

export const createBatchWithTokens = async ({
  schoolId,
  count,
  createdBy,
  notes,
  tokenData, // [{ tokenHash, expiresAt }]
}) => {
  return await prisma.$transaction(async (tx) => {
    const batch = await tx.tokenBatch.create({
      data: {
        school_id: schoolId,
        count,
        created_by: createdBy,
        notes,
      },
    });

    await tx.token.createMany({
      data: tokenData.map(({ tokenHash, expiresAt }) => ({
        school_id: schoolId,
        batch_id: batch.id,
        token_hash: tokenHash,
        status: "UNASSIGNED",
        expires_at: expiresAt,
      })),
    });

    // createMany doesn't return records — fetch them back by batch_id
    const createdTokens = await tx.token.findMany({
      where: { batch_id: batch.id },
      select: { id: true, token_hash: true },
      orderBy: { created_at: "asc" },
    });

    return { batch, createdTokens };
  });
};

// =============================================================================
// SINGLE PRELOADED TOKEN
// =============================================================================

export const createPreloadedToken = async ({
  schoolId,
  studentId,
  tokenHash,
  expiresAt,
  now,
}) => {
  return await prisma.token.create({
    data: {
      school_id: schoolId,
      student_id: studentId,
      token_hash: tokenHash,
      status: "ACTIVE",
      expires_at: expiresAt,
      assigned_at: now,
      activated_at: now,
    },
  });
};

// =============================================================================
// BULK PRELOADED TOKENS
// =============================================================================

export const createBatchWithPreloadedTokens = async ({
  schoolId,
  count,
  createdBy,
  notes,
  tokenData, // [{ studentId, tokenHash, expiresAt, now }]
}) => {
  return await prisma.$transaction(async (tx) => {
    const batch = await tx.tokenBatch.create({
      data: {
        school_id: schoolId,
        count,
        created_by: createdBy,
        notes,
      },
    });

    await tx.token.createMany({
      data: tokenData.map(({ studentId, tokenHash, expiresAt, now }) => ({
        school_id: schoolId,
        batch_id: batch.id,
        student_id: studentId,
        token_hash: tokenHash,
        status: "ACTIVE",
        expires_at: expiresAt,
        assigned_at: now,
        activated_at: now,
      })),
    });

    const createdTokens = await tx.token.findMany({
      where: { batch_id: batch.id },
      select: { id: true, token_hash: true, student_id: true },
      orderBy: { created_at: "asc" },
    });

    return { batch, createdTokens };
  });
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export const findSchoolWithSettings = async (schoolId) => {
  return await prisma.school.findUnique({
    where: { id: schoolId },
    include: { settings: true },
  });
};

export const findStudentInSchool = async (studentId, schoolId) => {
  return await prisma.student.findFirst({
    where: {
      id: studentId,
      school_id: schoolId,
      is_active: true,
      deleted_at: null,
    },
  });
};

export const findStudentsInSchool = async (studentIds, schoolId) => {
  return await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      school_id: schoolId,
      is_active: true,
      deleted_at: null,
    },
    select: { id: true },
  });
};

export const countActiveTokensForStudent = async (studentId) => {
  return await prisma.token.count({
    where: {
      student_id: studentId,
      status: { in: ["ACTIVE", "INACTIVE"] },
    },
  });
};

export const groupActiveTokenCountsByStudents = async (studentIds) => {
  return await prisma.token.groupBy({
    by: ["student_id"],
    where: {
      student_id: { in: studentIds },
      status: { in: ["ACTIVE", "INACTIVE"] },
    },
    _count: { id: true },
  });
};
