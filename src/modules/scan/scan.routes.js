import { Router } from "express";
import { handleScan } from "./scan.controller.js";
import {
  scanGlobalLimiter,
  scanLimiter,
  scanBurstLimiter,
  perTokenLimiter,
} from "../../middlewares/rateLimit.middleware.js";

const router = Router();

// =============================================================================
// Public Scan Routes
//
// No auth middleware — this endpoint must be publicly accessible.
// Rate limiting is the only protection at the route level.
// All security and business logic lives in the service layer.
//
// Rate limit order matters:
//   1. scanGlobalLimiter  — system ceiling (5000 req/min total across all IPs)
//   2. scanLimiter        — per-IP 30 req/min
//   3. scanBurstLimiter   — per-IP 10 req/10s (stops rapid-fire automation)
//   4. perTokenLimiter    — per-token 10 req/min (stops hammering one QR)
//   5. handleScan         — business logic
//
// Why POST and not GET?
//   - Token never appears in server access logs or browser history
//   - POST body is not cached by browsers or CDNs
// =============================================================================

router.post(
  "/",
  scanGlobalLimiter,
  scanLimiter,
  scanBurstLimiter,
  perTokenLimiter,
  handleScan,
);

// =============================================================================
// Health check — used by load balancers and uptime monitors
// =============================================================================

router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "scan" });
});

export default router;
