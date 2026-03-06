import prisma from "../../config/prisma.js";
import { encrypt } from "../../utils/encryption.js";

// =============================================================================
// Parent Repository — pure DB access, zero business logic
//
// Fixes applied:
//   [R1] updateSessionHash() added — called after JWT generation to replace
//        the "pending_xxx" placeholder created during completeRegistration
//   [R2] findStudentForAudit() added — fetches old values for audit log
//   [R3] findParentWithFullProfile() selects doctor_phone_encrypted correctly
//        per schema (field name is doctor_phone_encrypted, not doctor_phone)
//   [R4] completeRegistration uses upsert on ParentUser — safe against races
// =============================================================================

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
// Creates: ParentUser (upsert) + Student + ParentStudent + Token update + Session
// Session is created with a placeholder hash — caller MUST call updateSessionHash()
// immediately after generating the real JWT pair. [R4]

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

    // 2. Create or find ParentUser — upsert handles race conditions
    const parent = await tx.parentUser.upsert({
      where: { phone_index },
      create: {
        phone: encrypt(phone),
        phone_index,
        is_phone_verified: true,
        status: "ACTIVE",
      },
      update: {}, // do nothing if already exists
      select: { id: true },
    });

    // 3. Create student shell — school_id only, parent fills rest during onboarding
    const student = await tx.student.create({
      data: {
        school_id,
        first_name: "Student", // placeholder — overwritten by PATCH /student/:id
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

    // 5. Token: UNASSIGNED → ISSUED
    await tx.token.update({
      where: { id: token_id },
      data: {
        status: "ISSUED",
        student_id: student.id,
        assigned_at: new Date(),
      },
    });

    // 6. Session with placeholder hash — [R1] caller updates this immediately
    const session = await tx.session.create({
      data: {
        parent_user_id: parent.id,
        refresh_token_hash: `pending_${Date.now()}`, // replaced by updateSessionHash
        device_info,
        ip_address: ip,
        expires_at: session_expires_at,
      },
      select: { id: true, parent_user_id: true },
    });

    return { student, session, parentId: parent.id };
  });
}

// ─── [R1] Update Session Hash ─────────────────────────────────────────────────
// Called immediately after JWT generation in verifyRegistration()
// Replaces the placeholder hash with the real SHA-256 of the refresh token

export async function updateSessionHash(sessionId, refreshTokenHash) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { refresh_token_hash: refreshTokenHash },
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

// ─── [R2] Find Student for Audit ─────────────────────────────────────────────
// Fetches current values before a PATCH so audit log has old_value

export async function findStudentForAudit(studentId) {
  return prisma.student.findUnique({
    where: { id: studentId },
    select: {
      school_id: true,
      first_name: true,
      last_name: true,
      class: true,
      section: true,
      emergency: {
        select: {
          blood_group: true,
          allergies: true,
          conditions: true,
          medications: true,
          doctor_name: true,
          notes: true,
        },
      },
    },
  });
}

// ─── Save Student Profile ─────────────────────────────────────────────────────
// Full replace on contacts — re-numbered by array index (priority = index + 1)

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
        update: {
          ...emergency,
          // [R3] Map doctor_phone from request → doctor_phone_encrypted in DB
          ...(emergency.doctor_phone !== undefined && {
            doctor_phone_encrypted: emergency.doctor_phone
              ? encrypt(emergency.doctor_phone)
              : null,
            doctor_phone: undefined, // don't write plaintext
          }),
          updated_at: new Date(),
        },
      });
    }

    if (contacts !== undefined) {
      // Full replace — delete existing, re-insert with new priorities
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
              phone_encrypted: encrypt(c.phone), // [R3] encrypt contact phone
              relationship: c.relationship ?? null,
              priority: i + 1,
              is_active: true,
            })),
          });
        }
      }
    }

    // Flip token ISSUED → ACTIVE once profile has real data
    if (student?.first_name) {
      await tx.token.updateMany({
        where: { student_id: studentId, status: "ISSUED" },
        data: { status: "ACTIVE", activated_at: new Date() },
      });
    }
  });
}

// ─── Get Full Profile ─────────────────────────────────────────────────────────
// [R3] Selects doctor_phone_encrypted + phone_encrypted — decrypted in service

export async function findParentWithFullProfile(parentId) {
  return prisma.parentUser.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      phone: true, // encrypted — decrypted in service
      children: {
        where: { student: { is_active: true, deleted_at: null } },
        orderBy: { is_primary: "desc" },
        select: {
          is_primary: true,
          relationship: true,
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              class: true,
              section: true,
              photo_url: true,
              school: {
                select: { id: true, name: true, logo_url: true },
              },
              emergency: {
                select: {
                  blood_group: true,
                  allergies: true,
                  conditions: true,
                  medications: true,
                  doctor_name: true,
                  doctor_phone_encrypted: true, // [R3] correct field name from schema
                  notes: true,
                  contacts: {
                    where: { is_active: true },
                    orderBy: { priority: "asc" },
                    select: {
                      id: true,
                      name: true,
                      phone_encrypted: true, // [R3] correct field name from schema
                      relationship: true,
                      priority: true,
                    },
                  },
                },
              },
              tokens: {
                where: { status: { in: ["ACTIVE", "ISSUED"] } },
                take: 1,
                orderBy: { assigned_at: "desc" },
                select: {
                  id: true,
                  status: true,
                  expires_at: true,
                  cards: {
                    take: 1,
                    select: { card_number: true, file_url: true },
                  },
                },
              },
              cardVisibility: {
                select: { visibility: true, hidden_fields: true },
              },
            },
          },
        },
      },
    },
  });
}
