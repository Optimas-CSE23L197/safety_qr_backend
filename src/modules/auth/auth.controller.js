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

  // ── Set refresh token as httpOnly cookie ──────────────────────────────
  res.cookie("refresh_token", data.refresh_token, {
    httpOnly: true, // JS can NEVER read this
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    sameSite: "strict", // no cross-site requests
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: "/api/auth", // cookie only sent to /api/auth routes
  });

  // ── Never send refresh token in body ──────────────────────────────────
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful",
    data: {
      access_token: data.access_token,
      user: data.user,
      // refresh_token ← intentionally excluded from body
    },
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

  res.cookie("refresh_token", data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful",
    data: {
      access_token: data.access_token,
      user: data.user,
    },
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
  // Cookie arrives automatically — browser sends it with every request to /api/auth
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: "No refresh token. Please login again.",
    });
  }

  const data = await authService.refreshTokens({
    refreshToken,
    ipAddress: extractIp(req),
    deviceInfo: req.headers["user-agent"] ?? null,
  });

  // Rotate — set new refresh token cookie
  res.cookie("refresh_token", data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Token refreshed",
    data: {
      access_token: data.access_token,
      // refresh_token ← never in body
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// Shared by all three actors — requireAuth runs before this
// ---------------------------------------------------------------------------
export const logoutController = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const refreshToken = req.cookies?.refresh_token; // read from cookie

  await authService.logoutUser({
    token,
    exp: req.user.exp,
    refreshToken: refreshToken ?? null,
  });

  // ── Clear the cookie ──────────────────────────────────────────────────
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Logged out successfully",
  });
});
