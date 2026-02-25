import pino from "pino";
import { env } from "../config/env.js";

const isDev = env.isProduction;

export const logger = pino({
  level: env.log_level || "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    service: "qr-safety-backend",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
