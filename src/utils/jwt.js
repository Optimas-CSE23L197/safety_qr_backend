import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Generate Access Token
 * Short-lived token used for API authorization
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtSecret_expires || "15m",
  });
};

/**
 * Generate Refresh Token
 * Long-lived token used to issue new access tokens
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, env.jwtRefresh, {
    expiresIn: env.jwtRefresh_expires || "7d",
  });
};

/**
 * Verify Access Token
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.jwtSecret);
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.jwtRefresh);
};
