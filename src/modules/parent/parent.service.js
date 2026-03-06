import crypto from "crypto";
import jwt from "jsonwebtoken";
import * as parentRepo from "./parent.repository.js";
import redis from "../../config/redis.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import { blindIndex, encrypt, decrypt } from "../../utils/encryption.js";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../config/logger.js";
import { auditLog } from "../../utils/auditLogger.js";

// =============================================================================
// Parent Service
//
// Flows:
//   1. register/init   → card lookup + OTP + nonce
//   2. register/verify → OTP check + atomic DB transaction + token pair
//   3. PATCH /student  → profile update + audit log
//   4. GET /me         → full profile with decrypted fields
//
// Fixes applied:
//   [P1] verifyRegistration now updates session.refresh_token_hash with the
//        real hash after JWT generation — was permanently "pending_xxx" before,
//        making every refresh attempt fail for new registrations
//   [P2] Phone normalized to E.164 before blindIndex — consistent with auth.service.js
//   [P3] Returns proper { accessToken, refreshToken, expiresAt } pair —
//        was returning { jwt } (single token) causing white screen on reopen
//   [P4] isNewUser: true returned — frontend routes to onboarding screen
//   [P5] getFullProfile decrypts phone + emergency contact phones
//   [P6] updateProfile creates ParentEditLog for audit trail
// =============================================================================

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 3;
const NONCE_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 30;

// [P2] Normalize phone — must match auth.service.js normalizePhone exactly
const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
};

const generateNonce = () => crypto.randomBytes(32).toString("hex");

const generateOtpCode = () => String(crypto.randomInt(100000, 999999));

const maskPhone = (phone) => {
  if (phone.length < 5) return "****";
  return phone.slice(0, -6).replace(/\d/g, "*") + phone.slice(-4);
};

const otpRedisKey = (phoneIndex) => `otp:reg:${phoneIndex}`;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const extractExp = (accessToken) => {
  try {
    return jwt.decode(accessToken).exp;
  } catch {
    return Math.floor(Date.now() / 1000) + 15 * 60;
  }
};

// =============================================================================
// Init Registration
//
// [P2] Ghost parent fix: ParentUser NOT created here — only after OTP verify.
//      Previously every "Send OTP" tap created a ghost ParentUser row.
// =============================================================================

export async function initRegistration({ card_number, phone }) {
  // [P2] Normalize phone before any lookup
  const normalized = normalizePhone(phone);

  // 1. Card lookup
  const card = await parentRepo.findCardByNumber(card_number);
  if (!card)
    throw new ApiError(404, "Card not found. Check the number and try again.");
  if (!card.token_id)
    throw new ApiError(
      400,
      "This card has no token assigned. Contact your school.",
    );

  // 2. Token must be UNASSIGNED
  const token = await parentRepo.findTokenById(card.token_id);
  if (!token) throw new ApiError(404, "Token not found.");
  if (token.status !== "UNASSIGNED")
    throw new ApiError(409, "This card is already registered.");

  // 3. Blind index from normalized phone
  const phoneIndex = blindIndex(normalized);

  // 4. OTP → Redis (store code + attempt counter as JSON)
  const otp = generateOtpCode();

  // DEV ONLY
  if (process.env.NODE_ENV !== "production") {
    logger.info({ phone: normalized, otp }, "[DEV] Registration OTP");
  }

  await redis.set(
    otpRedisKey(phoneIndex),
    JSON.stringify({ code: otp, attempts: 0 }),
    "EX",
    OTP_TTL_SECONDS,
  );

  // 5. Nonce → Postgres with phone_index attached
  const nonce = generateNonce();
  await parentRepo.createNonce({
    nonce,
    token_id: token.id,
    expires_at: new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000),
    phone_index: phoneIndex,
  });

  // TODO: await smsQueue.add("send-otp", { phone: normalized, otp });

  return { nonce, masked_phone: maskPhone(normalized) };
}

// =============================================================================
// Verify Registration
//
// [P1] Session hash fix: after transaction creates session with placeholder,
//      we update it with the real refresh_token_hash
// [P3] Returns proper token pair
// [P4] Returns isNewUser: true
// =============================================================================

export async function verifyRegistration({
  nonce,
  otp,
  ip,
  device_info,
  phone,
}) {
  // [P2] Normalize before any lookup
  const normalized = normalizePhone(phone);

  // 1. Validate nonce
  const nonceRecord = await parentRepo.findNonce(nonce);
  if (!nonceRecord)
    throw new ApiError(400, "Invalid or expired registration link.");
  if (nonceRecord.used)
    throw new ApiError(400, "This registration link has already been used.");
  if (new Date(nonceRecord.expires_at) < new Date())
    throw new ApiError(400, "Registration link expired. Please start again.");

  // 2. Phone index from nonce
  const phoneIndex = nonceRecord.phone_index;
  if (!phoneIndex)
    throw new ApiError(
      400,
      "Registration session is invalid. Please start again.",
    );

  // 3. Token must still be UNASSIGNED
  const token = await parentRepo.findTokenById(nonceRecord.token_id);
  if (!token) throw new ApiError(404, "Token not found.");
  if (token.status !== "UNASSIGNED")
    throw new ApiError(409, "This card has already been registered.");

  // 4. Validate OTP from Redis
  const otpRaw = await redis.get(otpRedisKey(phoneIndex));
  if (!otpRaw)
    throw new ApiError(400, "OTP expired. Please request a new one.");

  const otpData = JSON.parse(otpRaw);

  if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpRedisKey(phoneIndex));
    throw new ApiError(
      429,
      "Too many incorrect attempts. Please request a new OTP.",
    );
  }

  if (otpData.code !== otp) {
    await redis.set(
      otpRedisKey(phoneIndex),
      JSON.stringify({ ...otpData, attempts: otpData.attempts + 1 }),
      "KEEPTTL",
    );
    const remaining = OTP_MAX_ATTEMPTS - (otpData.attempts + 1);
    throw new ApiError(
      400,
      `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    );
  }

  await redis.del(otpRedisKey(phoneIndex));

  // 5. Atomic transaction: create ParentUser + student + session
  const sessionExpiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const { student, session, parentId } = await parentRepo.completeRegistration({
    nonce,
    token_id: token.id,
    school_id: token.school_id,
    phone_index: phoneIndex,
    phone: normalized,
    ip,
    device_info,
    session_expires_at: sessionExpiresAt,
  });

  // 6. Generate proper token pair
  const payload = { sub: parentId, role: "PARENT", actorType: "parent" };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const expiresAt = extractExp(accessToken);

  // [P1] Update session with real hash — transaction used placeholder
  await parentRepo.updateSessionHash(session.id, hashToken(refreshToken));

  // [P6] Audit log
  auditLog({
    schoolId: token.school_id,
    actorType: "PARENT_USER",
    actorId: parentId,
    action: "REGISTER",
    entity: "ParentUser",
    entityId: parentId,
    newValue: { student_id: student.id, token_id: token.id },
    ipAddress: ip ?? null,
  });

  return {
    accessToken,
    refreshToken,
    expiresAt, // [P3] Unix seconds
    isNewUser: true, // [P4] always true for registration flow
    student_id: student.id,
    parent_id: parentId,
    isProfileComplete: false,
  };
}

// =============================================================================
// Update Student Profile
//
// [P6] Writes ParentEditLog for audit trail
// Schema: ParentEditLog.field_group maps to ParentEditType enum
// =============================================================================

export async function updateProfile({
  studentId,
  parentId,
  student,
  emergency,
  contacts,
}) {
  // Ownership check — parent must be linked to this student
  const link = await parentRepo.findParentStudent({ parentId, studentId });
  if (!link) throw new ApiError(403, "You do not have access to this student.");

  // Fetch old values for audit log
  const oldProfile = await parentRepo.findStudentForAudit(studentId);

  await parentRepo.saveStudentProfile({
    studentId,
    student,
    emergency,
    contacts,
  });

  // [P6] Write audit log entries per section changed
  const schoolId = oldProfile?.school_id ?? null;

  if (student) {
    auditLog({
      schoolId,
      actorType: "PARENT_USER",
      actorId: parentId,
      action: "UPDATE",
      entity: "Student",
      entityId: studentId,
      oldValue: {
        first_name: oldProfile?.first_name,
        last_name: oldProfile?.last_name,
        class: oldProfile?.class,
        section: oldProfile?.section,
      },
      newValue: student,
      fieldGroup: "STUDENT_NAME",
    });
  }

  if (emergency) {
    auditLog({
      schoolId,
      actorType: "PARENT_USER",
      actorId: parentId,
      action: "UPDATE",
      entity: "EmergencyProfile",
      entityId: studentId,
      oldValue: oldProfile?.emergency ?? null,
      newValue: emergency,
      fieldGroup: "EMERGENCY_PROFILE",
    });
  }

  if (contacts !== undefined) {
    auditLog({
      schoolId,
      actorType: "PARENT_USER",
      actorId: parentId,
      action: "UPDATE",
      entity: "EmergencyContacts",
      entityId: studentId,
      oldValue: null,
      newValue: { count: contacts.length },
      fieldGroup: "EMERGENCY_CONTACTS",
    });
  }
}

// =============================================================================
// Get Full Profile — GET /parent/me
//
// [P5] Decrypts phone and emergency contact phones before returning
// Returns shape that profile.store.fetchAndPersist() expects:
//   { parent, students: [{ ...student, school, token, emergency, contacts }] }
// =============================================================================

export async function getFullProfile(parentId) {
  const raw = await parentRepo.findParentWithFullProfile(parentId);
  if (!raw) throw new ApiError(404, "Parent not found.");

  return {
    parent: {
      id: raw.id,
      phone: decrypt(raw.phone), // [P5] decrypt before sending to mobile
    },
    students: raw.children.map(({ is_primary, relationship, student }) => {
      // Decrypt emergency contact phones
      const contacts = (student.emergency?.contacts ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: decrypt(c.phone_encrypted), // [P5]
        relationship: c.relationship ?? null,
        priority: c.priority,
      }));

      return {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name ?? null,
        class: student.class ?? null,
        section: student.section ?? null,
        photo_url: student.photo_url ?? null,
        is_primary,
        relationship: relationship ?? null,
        school: student.school,

        // Token + card flat for easy store consumption
        token: student.tokens[0]
          ? {
              id: student.tokens[0].id,
              status: student.tokens[0].status,
              expires_at: student.tokens[0].expires_at,
              card_number: student.tokens[0].cards[0]?.card_number ?? null,
              card_file_url: student.tokens[0].cards[0]?.file_url ?? null,
            }
          : null,

        emergency: student.emergency
          ? {
              blood_group: student.emergency.blood_group ?? null,
              allergies: student.emergency.allergies ?? null,
              conditions: student.emergency.conditions ?? null,
              medications: student.emergency.medications ?? null,
              doctor_name: student.emergency.doctor_name ?? null,
              // doctor_phone_encrypted decrypted here
              doctor_phone: student.emergency.doctor_phone_encrypted
                ? decrypt(student.emergency.doctor_phone_encrypted)
                : null,
              notes: student.emergency.notes ?? null,
              contacts,
            }
          : null,

        card_visibility: student.cardVisibility ?? null,
      };
    }),
  };
}
