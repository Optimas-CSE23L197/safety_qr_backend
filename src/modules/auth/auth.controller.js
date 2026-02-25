import { asyncHandler } from "../../utils/asyncHandler.js";
import * as authService from "./auth.service.js";
import { HTTP_STATUS } from "../../config/constants.js";
import { extractIp } from "../../utils/extractIp.js";

// =============================================================================
// Auth Controller — thin layer
// Extracts only what the service needs from req.
// Never passes req/res into the service layer.
// =============================================================================

// ---------------------------------------------------------------------------
// POST /auth/super-admin
// ---------------------------------------------------------------------------
export const loginSuperAdminController = asyncHandler(async (req, res) => {
  const data = await authService.loginSuperAdmin({
    email: req.body.email,
    password: req.body.password,
    ipAddress: extractIp(req),
    deviceInfo: req.headers["user-agent"] ?? null,
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful",
    data,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/school
// ---------------------------------------------------------------------------
export const loginSchoolUserController = asyncHandler(async (req, res) => {
  const data = await authService.loginSchoolUser({
    email: req.body.email,
    password: req.body.password,
    ipAddress: extractIp(req),
    deviceInfo: req.headers["user-agent"] ?? null,
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful",
    data,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/parent/send-otp
// ---------------------------------------------------------------------------
export const sendOtpController = asyncHandler(async (req, res) => {
  const data = await authService.sendOtp({
    phone: req.body.phone,
    ipAddress: extractIp(req),
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: data.message,
    data: { isNewUser: data.isNewUser },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/parent/verify-otp
// ---------------------------------------------------------------------------
export const verifyOtpController = asyncHandler(async (req, res) => {
  const data = await authService.verifyOtp({
    phone: req.body.phone,
    otp: req.body.otp,
    ipAddress: extractIp(req),
    deviceInfo: req.headers["user-agent"] ?? null,
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: data.isNewUser
      ? "Account created successfully"
      : "Login successful",
    data,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// Shared by all three actors — actor type determined from session
// ---------------------------------------------------------------------------
export const refreshTokenController = asyncHandler(async (req, res) => {
  const data = await authService.refreshTokens({
    refreshToken: req.body.refresh_token,
    ipAddress: extractIp(req),
    deviceInfo: req.headers["user-agent"] ?? null,
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Token refreshed",
    data,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// Shared by all three actors — requireAuth runs before this
// ---------------------------------------------------------------------------
export const logoutController = asyncHandler(async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];

  await authService.logoutUser({
    token,
    exp: req.user.exp,
    refreshToken: req.body.refresh_token ?? null,
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Logged out successfully",
  });
});
