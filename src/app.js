import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import compression from "compression";
import "dotenv/config";
import { errorHandler } from "./middlewares/error.middleware.js";
import { httpLogger } from "./middlewares/httpLogger.middleware.js";
import { requestId } from "./middlewares/requestId.middleware.js";
import {
  corsMiddleware,
  scanCorsMiddleware,
} from "./middlewares/cors.middleware.js";
import { sanitize } from "./middlewares/xss.middleware.js";
import { globalLimiter } from "./middlewares/rateLimit.middleware.js";
import { ApiError } from "./utils/ApiError.js";
import routes from "./routes/index.js";
import cookieParser from "cookie-parser";

const app = express();
const API_PREFIX = `/api/${process.env.API_VERSION || "v1"}`;

// =============================================================================
// TRUST PROXY
// Must be first — tells Express to trust X-Forwarded-For from your
// reverse proxy (Nginx / Cloudflare). Required for correct IP extraction.
// =============================================================================
app.set("trust proxy", 1);

// =============================================================================
// SECURITY HEADERS
// Helmet must run before any response is sent.
// =============================================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "https://res.cloudinary.com", "data:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "https://api.resqid.com"],
        frameAncestors: ["'none'"], // equivalent of X-Frame-Options: DENY
      },
    },
    crossOriginEmbedderPolicy: false, // keep false if embedding Cloudinary images
  }),
);

// =============================================================================
// REQUEST ID
// Must run before httpLogger so every log line has a request ID.
// =============================================================================
app.use(requestId);

// =============================================================================
// HTTP LOGGER
// Before routes so every request is logged regardless of outcome.
// =============================================================================
app.use(httpLogger);

// =============================================================================
// CORS
// Scan endpoint gets open CORS (any phone browser must reach it).
// All other routes get strict origin whitelist.
// Scan CORS must be registered BEFORE the global corsMiddleware.
// =============================================================================
app.use(`${API_PREFIX}/scan`, scanCorsMiddleware);
app.use(corsMiddleware);

// =============================================================================
// PREVENT HTTP PARAMETER POLLUTION
// e.g. ?status=ACTIVE&status=REVOKED — hpp picks the last value only.
// =============================================================================
app.use(hpp());

// =============================================================================
// BODY PARSING
// Parse first, sanitize after — sanitize must see parsed body.
// Consistent limits across both parsers.
// File uploads must use multipart/form-data + multer — not JSON body.
// =============================================================================
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

// =============================================================================
// XSS SANITIZATION
// Runs after body parsing so req.body, req.params, req.query are populated.
// Strips all HTML tags from string inputs before they reach any route.
// =============================================================================
app.use(sanitize);

// =============================================================================
// GLOBAL RATE LIMITER
// Baseline protection across entire API.
// Individual route limiters (auth, scan) layer on top of this.
// =============================================================================
app.use(globalLimiter);

// =============================================================================
// COMPRESSION
// After rate limiter — no point compressing rejected requests.
// Filter skips already-compressed content (images, PDFs).
// =============================================================================
app.use(
  compression({
    filter: (req, res) => {
      const contentType = res.getHeader("Content-Type") ?? "";
      if (/image|pdf/.test(contentType)) return false;
      return compression.filter(req, res);
    },
    level: 6, // balanced cpu vs compression ratio
  }),
);

// ! Cookie parser
app.use(cookieParser());
// =============================================================================
// API ROUTES
// =============================================================================
app.use(API_PREFIX, routes);

// =============================================================================
// 404 HANDLER
// Catches any request that didn't match a route.
// Uses ApiError so the format is identical to all other errors.
// =============================================================================
app.use((req, res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
});

// =============================================================================
// GLOBAL ERROR HANDLER
// Must be last — Express identifies error handlers by the 4-argument signature.
// =============================================================================
app.use(errorHandler);

export default app;
