// utils/extractIp.js
export const extractIp = (req) =>
  req.headers["cf-connecting-ip"] ??
  req.headers["x-real-ip"] ??
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
  req.socket?.remoteAddress ??
  "unknown";
