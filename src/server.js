import app from "./app.js";
import { logger } from "./config/logger.js";
import { env } from "./config/env.js";
import prisma from "./config/prisma.js";
import redis from "./config/redis.js";

const PORT = env.port;
let server;

const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info("Database connected");

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
};

startServer();

//! ================= GRACEFUL SHUTDOWN =================
const shutdown = async (signal) => {
  logger.info({ signal }, "Shutting down gracefully");

  // Force kill after 10 seconds if graceful shutdown hangs
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out — force exiting");
    process.exit(1);
  }, 10_000);

  // Prevent the timeout from keeping the process alive
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info("Server closed");
    }
    await prisma.$disconnect();
    logger.info("Database disconnected");
    await redis.quit();
    logger.info("Redis disconnected");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

//! ================= UNHANDLED ERRORS =================

process.on("unhandledRejection", (reason, promise) => {
  if (reason instanceof Error) {
    logger.error({ err: reason, stack: reason.stack }, "Unhandled Rejection");
  } else {
    logger.error({ reason, promise }, "Unhandled Rejection (non-error value)");
  }

  shutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception");
  shutdown("uncaughtException"); // graceful instead of immediate exit
});
