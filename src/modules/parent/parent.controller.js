import * as parentService from "./parent.service.js";
import { AppError } from "../utils/errors.js";

// ─── POST /auth/register/init ─────────────────────────────────────────────────

export async function registerInit(req, res, next) {
  try {
    const { card_number, phone } = req.body;

    const result = await parentService.initRegistration({ card_number, phone });

    return res.status(200).json({
      success: true,
      data: result, // { nonce, masked_phone }
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/register/verify ───────────────────────────────────────────────

export async function registerVerify(req, res, next) {
  try {
    const { nonce, otp } = req.body;
    const ip = req.ip;
    const device_info = req.headers["user-agent"] ?? null;

    const result = await parentService.verifyRegistration({
      nonce,
      otp,
      ip,
      device_info,
    });

    return res.status(201).json({
      success: true,
      data: result, // { jwt, student_id, isProfileComplete: false }
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /student/:studentId ────────────────────────────────────────────────

export async function updateStudentProfile(req, res, next) {
  try {
    const { studentId } = req.params;
    const { student, emergency, contacts } = req.body;
    const parentId = req.parent.id; // set by requireParentAuth middleware

    await parentService.updateProfile({
      studentId,
      parentId,
      student,
      emergency,
      contacts,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
