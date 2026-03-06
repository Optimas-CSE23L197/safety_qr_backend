import * as parentService from "./parent.service.js";
import { ApiError } from "../../utils/ApiError.js";

// ─── POST /parent/register/init ───────────────────────────────────────────────

export async function registerInit(req, res, next) {
  try {
    const { card_number, phone } = req.body;
    const result = await parentService.initRegistration({ card_number, phone });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── POST /parent/register/verify ─────────────────────────────────────────────
//
// FIX: passes phone from req.body to service so completeRegistration
//      can encrypt it. Previously phone was never passed to verify.

export async function registerVerify(req, res, next) {
  try {
    const { nonce, otp, phone } = req.body; // FIX: include phone
    const ip = req.ip;
    const device_info = req.headers["user-agent"] ?? null;

    const result = await parentService.verifyRegistration({
      nonce,
      otp,
      ip,
      device_info,
      phone, // FIX: pass phone for ParentUser creation
    });

    // FIX: Returns proper token pair { accessToken, refreshToken, expiresAt }
    // Mobile otp.jsx reads result.data.accessToken + result.data.refreshToken
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /parent/student/:studentId ────────────────────────────────────────

export async function updateStudentProfile(req, res, next) {
  try {
    const { studentId } = req.params;
    const { student, emergency, contacts } = req.body;
    const parentId = req.user.id;

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

// =============================================================================
// PATCH 3 — parent.controller.js
// ADD this function
// =============================================================================

export async function getParentMe(req, res, next) {
  try {
    // req.user.id = parent.id from JWT sub — no other lookup needed
    const data = await parentService.getFullProfile(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
