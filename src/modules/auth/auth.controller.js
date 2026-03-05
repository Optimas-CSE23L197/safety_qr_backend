import { asyncHandler } from "../../utils/asyncHandler.js";
import * as authService from "./auth.service.js";
import { HTTP_STATUS } from "../../config/constants.js";
import { extractIp } from "../../utils/extractIp.js";

// =============================================================================
// Auth Controller
// FIX-1: refreshTokenController now reads refreshToken from req.body (not cookie)
//        Mobile apps cannot use httpOnly cookies. Cookie approach only works for
//        web browsers. Mobile sends refreshToken in request body.
// FIX-2: refreshTokenController returns camelCase { accessToken, refreshToken }
//        to match what tokenRefresh.js and auth.api.js expect.
// FIX-3: verifyOtpController response normalized to camelCase.
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

  // Web clients still get the cookie
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
      accessToken: data.access_token, // camelCase for mobile clients
      access_token: data.access_token, // snake_case for web/dashboard clients
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
      accessToken: data.access_token,
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
// FIX-3: Returns camelCase tokens to match mobile tokenRefresh.js expectations
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
    data: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      parent: data.parent,
      isNewUser: data.isNewUser,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// FIX-1: Reads refreshToken from req.body (mobile) with cookie fallback (web)
// FIX-2: Returns camelCase { accessToken, refreshToken } for mobile
// ---------------------------------------------------------------------------
export const refreshTokenController = asyncHandler(async (req, res) => {
  // FIX-1: Mobile sends refreshToken in body. Web browsers send it as cookie.
  // Support both — body takes priority.
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
  res.cookie("refresh_token", data.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });

  // FIX-2: Return BOTH naming conventions so web and mobile both work
  return res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Token refreshed",
    data: {
      accessToken: data.access_token, // camelCase — mobile tokenRefresh.js
      access_token: data.access_token, // snake_case — web/dashboard
      refreshToken: data.refresh_token, // mobile needs this for storage rotation
      refresh_token: data.refresh_token,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
export const logoutController = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  // Support both cookie and body for refresh token
  const refreshToken =
    req.cookies?.refresh_token ?? req.body?.refreshToken ?? null;

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
