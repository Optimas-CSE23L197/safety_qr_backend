import dotenv from "dotenv";
dotenv.config();

// * array or env variable name
const requireEnv = [
  "PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "JWT_REFRESH_SECRET",
  "JWT_REFRESH_EXPIRES_IN",
  "NODE_ENV",
  "TOKEN_BYTES",
  "CHUNK_SIZE",
  "LOG_LEVEL",
];

// ! check missing variable
const missingVariable = requireEnv.filter((key) => !process.env[key]);

if (missingVariable.length > 0) {
  console.error("Missing required environment variables:");
  missingVariable.forEach((key) => console.error(` - ${key}`));
  process.exit(1);
}

// export validated config
export const env = {
  port: Number(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtSecret_expires: process.env.JWT_EXPIRES_IN,
  jwtRefresh: process.env.JWT_REFRESH_SECRET,
  jwtRefresh_expires: process.env.JWT_REFRESH_EXPIRES_IN,
  nodeEnv: process.env.NODE_ENV,
  isProduction: process.env.NODE_ENV === "production",
  token_bytes: process.env.TOKEN_BYTES,
  chunk_size: process.env.CHUNK_SIZE,
  log_level: process.env.LOG_LEVEL,
};
