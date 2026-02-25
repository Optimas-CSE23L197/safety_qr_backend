import cors from "cors";

const ALLOWED_ORIGINS = {
  scan: ["https://scan.resqid.com"],
  dashboard: ["https://app.resqid.com"],
  api: ["https://app.resqid.com", "https://scan.resqid.com"],
  // local dev
  localDev: ["http://localhost:3000", "http://localhost:5173"],
};

// Different CORS rules for scan endpoint vs dashboard API
// Public scan page needs different origin rules than admin dashboard
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true, // allow cookies and auth headers
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id", "X-RateLimit-Remaining"],
  maxAge: 86400,
});

// Scan endpoint CORS — more permissive because it's public
// Anyone's phone browser needs to be able to call it
export const scanCorsMiddleware = cors({
  origin: "*", // truly public — any origin can scan
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400,
});
