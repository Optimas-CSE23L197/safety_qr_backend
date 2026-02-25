import { processScan } from "./scan.service.js";
import { validateScanRequest } from "./scan.validation.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { extractIp } from "../../utils/extractIp.js";

const STATUS_MAP = {
  SUCCESS: 200,
  INVALID: 404,
  REVOKED: 410, // 410 Gone — intentionally deactivated
  EXPIRED: 410,
  INACTIVE: 410,
  RATE_LIMITED: 429,
  ERROR: 500,
};

export const handleScan = asyncHandler(async (req, res) => {
  const { data, error } = validateScanRequest(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: "INVALID",
      message: "Invalid request.",
    });
  }

  const scanMeta = {
    ipAddress: extractIp(req),
    userAgent: req.headers["user-agent"] ?? null,
    ipCountry: req.headers["cf-ipcountry"] ?? req.headers["x-country"] ?? null,
    ipCity: req.headers["cf-ipcity"] ?? null,
    location: data.location ?? null,
  };

  const result = await processScan(data.token, scanMeta);

  return res.status(STATUS_MAP[result.result] ?? 500).json(result);
});
