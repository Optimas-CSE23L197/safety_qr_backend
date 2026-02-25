import { ApiError } from "../utils/ApiError.js";
import { logger } from "../config/logger.js";
import { Prisma } from "@prisma/client";

export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Handle Prisma errors gracefully
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      // Unique constraint violation
      const field = err.meta?.target?.[0] ?? "field";
      error = new ApiError(409, `${field} already exists`);
    } else if (err.code === "P2025") {
      // Record not found
      error = new ApiError(404, "Record not found");
    } else {
      error = new ApiError(500, "Database error");
    }
  }

  // Handle JWT errors
  else if (err.name === "JsonWebTokenError") {
    error = new ApiError(401, "Invalid token");
  } else if (err.name === "TokenExpiredError") {
    error = new ApiError(401, "Token expired");
  }

  // Normalize everything else
  else if (!(error instanceof ApiError)) {
    error = new ApiError(
      err.statusCode || 500,
      err.message || "Something went wrong",
      err?.errors || [],
      process.env.NODE_ENV === "development" ? err.stack : undefined,
    );
  }

  // Use logger
  logger.error({
    method: req.method,
    url: req.originalUrl,
    status: error.statusCode,
    message: error.message,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });

  return res.status(error.statusCode).json({
    success: false,
    message: error.message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
};
