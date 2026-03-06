import { asyncHandler } from "../../utils/asyncHandler.js";
import * as authService from "./auth.service.js";
import { HTTP_STATUS } from "../../config/constants.js";
import { extractIp } from "../../utils/extractIp.js";

// =============================================================================
// Auth Controller
//
// Three actors: SuperAdmin, SchoolUser, ParentUser
//
// Mobile vs Web token delivery:
//   - Mobile: refreshToken in response body (httpOnly cookies don't work in RN)
//   - Web:    refreshToken in httpOnly cookie
//   - Both:   accessToken in response body
//
// Response keys: both camelCase (mobile) + snake_case (web/dashboard)
// =============================================================================

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — matches REFRESH_TTL_DAYS
  path: "/api/auth",
};

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

  res.cookie("refresh_token", data.refresh_token, COOKIE_OPTIONS);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful",
    data: {
      accessToken: data.access_token,
      access_token: data.access_token,
      refreshToken: data.refresh_token, // for mobile (no cookies)
      refresh_token: data.refresh_token,
      user: data.user,
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

  res.cookie("refresh_token", data.refresh_token, COOKIE_OPTIONS);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful",
    data: {
      accessToken: data.access_token,
      access_token: data.access_token,
      refreshToken: data.refresh_token,
      refresh_token: data.refresh_token,
      user: data.user,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/send-otp
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
// POST /auth/verify-otp
//
// Returns both tokens in body — mobile reads them directly.
// Also sets httpOnly cookie for any web clients.
// isNewUser tells the frontend whether to route to onboarding or home.
// ---------------------------------------------------------------------------
export const verifyOtpController = asyncHandler(async (req, res) => {
  const data = await authService.verifyOtp({
    phone: req.body.phone,
    otp: req.body.otp,
    ipAddress: extractIp(req),
    deviceInfo: req.headers["user-agent"] ?? null,
  });

  // Set cookie for web clients even though mobile doesn't use it
  res.cookie("refresh_token", data.refreshToken, COOKIE_OPTIONS);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: data.isNewUser
      ? "Account created successfully"
      : "Login successful",
    data: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt, // Unix seconds — mobile storage.setTokens
      isNewUser: data.isNewUser, // frontend routing flag
      parent: data.parent, // { id }
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
//
// Mobile sends refreshToken in body.
// Web browsers send it as httpOnly cookie.
// Body takes priority — cookie is fallback.
// Returns new refresh token — mobile MUST save it (rotation).
// ---------------------------------------------------------------------------
export const refreshTokenController = asyncHandler(async (req, res) => {
  const refreshToken =
    req.body?.refreshToken ?? req.cookies?.refresh_token ?? null;

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

  // Rotate cookie for web clients
  res.cookie("refresh_token", data.refresh_token, COOKIE_OPTIONS);

  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Token refreshed",
    data: {
      accessToken: data.access_token,
      access_token: data.access_token,
      refreshToken: data.refresh_token, // mobile MUST save — token rotated
      refresh_token: data.refresh_token,
      expiresAt: data.expiresAt, // Unix seconds
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
export const logoutController = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const refreshToken =
    req.body?.refreshToken ?? req.cookies?.refresh_token ?? null;

  await authService.logoutUser({
    token,
    exp: req.user.exp,
    refreshToken,
  });

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
