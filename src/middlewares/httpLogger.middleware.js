import { pinoHttp } from "pino-http";
import { logger } from "../config/logger.js";
import { randomUUID } from "crypto";

const SENSITIVE_FIELDS = [
  "password",
  "token",
  "authorization",
  "secret",
  "otp",
];

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers["x-request-id"] || randomUUID(),
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  //! Never log the scan endpoint token -- security credential
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} completed with ${req.statusCode}`,

  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        query: req.query,
        params: req.params,
        // never log header that contains auth token
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});
