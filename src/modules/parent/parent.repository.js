import prisma from "../../config/prisma.js";
import { encrypt } from "../../utils/encryption.js";

// ─── Card & Token ─────────────────────────────────────────────────────────────

export async function findCardByNumber(card_number) {
  return prisma.card.findUnique({
    where: { card_number },
    select: { id: true, token_id: true, school_id: true },
  });
}

export async function findTokenById(token_id) {
  return prisma.token.findUnique({
    where: { id: token_id },
    select: { id: true, school_id: true, status: true, student_id: true },
  });
}

// ─── Nonce ────────────────────────────────────────────────────────────────────

export async function createNonce({
  nonce,
  token_id,
  expires_at,
  phone_index,
}) {
  return prisma.registrationNonce.create({
    data: { nonce, token_id, expires_at, phone_index },
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
      phone_index: true,
    },
  });
}

// ─── Complete Registration (atomic transaction) ───────────────────────────────
//
// FIX (Ghost Parents): ParentUser created HERE after OTP verified.
// FIX (Encrypted Phones): Uses encrypt(phone) — consistent with auth.repository.js.
// Returns { student, session, parentId } so service generates JWT with correct sub.

export async function completeRegistration({
  nonce,
  token_id,
  school_id,
  phone_index,
  phone,
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

    // 2. Create ParentUser with encrypted phone (upsert handles race conditions)
    const parent = await tx.parentUser.upsert({
      where: { phone_index },
      create: {
        phone: encrypt(phone),
        phone_index,
        is_phone_verified: true,
        status: "ACTIVE",
      },
      update: {},
      select: { id: true },
    });

    // 3. Create student shell
    const student = await tx.student.create({
      data: {
        school_id,
        first_name: "Student",
        is_active: true,
      },
      select: { id: true },
    });

    // 4. Link parent → student
    await tx.parentStudent.create({
      data: { parent_id: parent.id, student_id: student.id, is_primary: true },
    });

    // 5. Token: UNASSIGNED → ISSUED
    await tx.token.update({
      where: { id: token_id },
      data: {
        status: "ISSUED",
        student_id: student.id,
        assigned_at: new Date(),
      },
    });

    // 6. Create session (refresh_token_hash updated by service after JWT generation)
    const session = await tx.session.create({
      data: {
        parent_user_id: parent.id,
        refresh_token_hash: `pending_${Date.now()}`,
        device_info,
        ip_address: ip,
        expires_at: session_expires_at,
      },
      select: { id: true, parent_user_id: true },
    });

    return { student, session, parentId: parent.id };
  });
}

// ─── Parent-Student ownership check ──────────────────────────────────────────

export async function findParentStudent({ parentId, studentId }) {
  return prisma.parentStudent.findUnique({
    where: {
      parent_id_student_id: { parent_id: parentId, student_id: studentId },
    },
    select: { id: true },
  });
}

// ─── Save Student Profile ─────────────────────────────────────────────────────

export async function saveStudentProfile({
  studentId,
  student,
  emergency,
  contacts,
}) {
  return prisma.$transaction(async (tx) => {
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

    if (emergency) {
      await tx.emergencyProfile.upsert({
        where: { student_id: studentId },
        create: { student_id: studentId, ...emergency },
        update: { ...emergency, updated_at: new Date() },
      });
    }

    if (contacts !== undefined) {
      const profile = await tx.emergencyProfile.findUnique({
        where: { student_id: studentId },
        select: { id: true },
      });
      if (profile) {
        await tx.emergencyContact.deleteMany({
          where: { profile_id: profile.id },
        });
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

    await tx.token.updateMany({
      where: { student_id: studentId, status: "ISSUED" },
      data: { status: "ACTIVE", activated_at: new Date() },
    });
  });
}
