import cors from "cors";

const ALLOWED_ORIGINS = [
  // Production
  "https://app.resqid.com",
  "https://scan.resqid.com",
  // Development
  "http://localhost:5173",
  "http://localhost:3000",
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, mobile apps)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
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
