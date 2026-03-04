import prisma from "../../config/prisma.js";
// ─── Card & Token ─────────────────────────────────────────────────────────────

export async function findCardByNumber(card_number) {
  return prisma.card.findUnique({
    where: { card_number },
    select: { id: true, token_id: true, school_id: true },
  });
}

export async function findTokenById(token_id) {
  // Also pull parent phone_index via ParentUser join (needed for OTP key in verify)
  const token = await prisma.token.findUnique({
    where: { id: token_id },
    select: {
      id: true,
      school_id: true,
      status: true,
      student: {
        select: {
          parents: {
            select: {
              parent: {
                select: { phone_index: true },
              },
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!token) return null;

  // Flatten parent phone_index onto token for service layer convenience
  return {
    ...token,
    parent_phone_index:
      token.student?.parents?.[0]?.parent?.phone_index ?? null,
  };
}

// ─── Parent User ──────────────────────────────────────────────────────────────

export async function upsertParentByPhone({ phone, phone_index }) {
  return prisma.parentUser.upsert({
    where: { phone_index },
    create: { phone, phone_index, status: "ACTIVE" },
    update: {}, // don't overwrite existing parent data on re-init
    select: { id: true, phone: true, phone_index: true },
  });
}

// ─── Nonce ────────────────────────────────────────────────────────────────────

export async function createNonce({ nonce, token_id, expires_at }) {
  return prisma.registrationNonce.create({
    data: { nonce, token_id, expires_at },
    select: { id: true },
  });
}

export async function findNonce(nonce) {
  return prisma.registrationNonce.findUnique({
    where: { nonce },
    select: {
      id: true,
      nonce: true,
      token_id: true,
      expires_at: true,
      used: true,
    },
  });
}

// ─── Complete Registration (atomic transaction) ───────────────────────────────

/**
 * Everything that must succeed together or roll back:
 *   1. Nonce marked used
 *   2. Student shell created
 *   3. ParentStudent link created
 *   4. Token → ISSUED, assigned_at = now
 *   5. Session created
 *
 * Token moves ISSUED → ACTIVE only after PATCH /student/:id (profile complete)
 */
export async function completeRegistration({
  nonce,
  token_id,
  school_id,
  phone_index,
  ip,
  device_info,
  session_expires_at,
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Mark nonce used
    await tx.registrationNonce.update({
      where: { nonce },
      data: { used: true },
    });

    // 2. Get parent by phone_index (guaranteed to exist — created in init)
    const parent = await tx.parentUser.findUniqueOrThrow({
      where: { phone_index },
      select: { id: true },
    });

    // 3. Create student shell — minimal, just school_id
    //    first_name is required by schema so we set a placeholder
    //    UpdatesScreen will overwrite this immediately
    const student = await tx.student.create({
      data: {
        school_id,
        first_name: "Student", // placeholder — replaced on first profile update
        is_active: true,
      },
      select: { id: true },
    });

    // 4. Link parent → student
    await tx.parentStudent.create({
      data: {
        parent_id: parent.id,
        student_id: student.id,
        is_primary: true,
      },
    });

    // 5. Token: UNASSIGNED → ISSUED, link to student
    await tx.token.update({
      where: { id: token_id },
      data: {
        status: "ISSUED",
        student_id: student.id,
        assigned_at: new Date(),
      },
    });

    // 6. Create session
    const session = await tx.session.create({
      data: {
        parent_user_id: parent.id,
        refresh_token_hash: `ph_${Date.now()}`, // placeholder — swap with real hash
        device_info,
        ip_address: ip,
        expires_at: session_expires_at,
      },
      select: { id: true, parent_user_id: true },
    });

    return { student, session };
  });
}

// ─── Parent-Student ownership check ──────────────────────────────────────────

export async function findParentStudent({ parentId, studentId }) {
  return prisma.parentStudent.findUnique({
    where: {
      parent_id_student_id: {
        parent_id: parentId,
        student_id: studentId,
      },
    },
    select: { id: true },
  });
}

// ─── Save Student Profile (atomic) ───────────────────────────────────────────

/**
 * Called from PATCH /student/:studentId
 * - Upserts Student fields
 * - Upserts EmergencyProfile
 * - Full-replaces EmergencyContacts (deleteMany + createMany)
 * - Moves Token ISSUED → ACTIVE (only if currently ISSUED)
 */
export async function saveStudentProfile({
  studentId,
  student,
  emergency,
  contacts,
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Update student fields if provided
    if (student) {
      await tx.student.update({
        where: { id: studentId },
        data: {
          ...(student.first_name !== undefined && {
            first_name: student.first_name,
          }),
          ...(student.last_name !== undefined && {
            last_name: student.last_name,
          }),
          ...(student.class !== undefined && { class: student.class }),
          ...(student.section !== undefined && { section: student.section }),
          ...(student.photo_url !== undefined && {
            photo_url: student.photo_url,
          }),
          updated_at: new Date(),
        },
      });
    }

    // 2. Upsert emergency profile if provided
    if (emergency) {
      await tx.emergencyProfile.upsert({
        where: { student_id: studentId },
        create: {
          student_id: studentId,
          ...emergency,
        },
        update: {
          ...emergency,
          updated_at: new Date(),
        },
      });
    }

    // 3. Full replace contacts if provided
    if (contacts !== undefined) {
      // Get emergency profile id first
      const profile = await tx.emergencyProfile.findUnique({
        where: { student_id: studentId },
        select: { id: true },
      });

      if (profile) {
        // Delete all existing contacts
        await tx.emergencyContact.deleteMany({
          where: { profile_id: profile.id },
        });

        // Re-create with correct priority order (index + 1)
        if (contacts.length > 0) {
          await tx.emergencyContact.createMany({
            data: contacts.map((c, i) => ({
              profile_id: profile.id,
              name: c.name,
              phone: c.phone,
              relationship: c.relationship ?? null,
              priority: i + 1,
              is_active: true,
            })),
          });
        }
      }
    }

    // 4. Token ISSUED → ACTIVE (only if ISSUED — idempotent, safe to call multiple times)
    await tx.token.updateMany({
      where: {
        student_id: studentId,
        status: "ISSUED",
      },
      data: {
        status: "ACTIVE",
        activated_at: new Date(),
      },
    });
  });
}
