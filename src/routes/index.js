import { Router } from "express";
const route = Router();

// auth route
import authRoute from "../modules/auth/auth.routes.js";
import superAdminRoute from "../modules/super_admin/superAdmin.routes.js";
import tokenRoute from "../modules/token/token.routes.js";

// Health check (load balancer friendly)
route.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// auth route use
route.use("/auth", authRoute);
route.use("/super-admin", superAdminRoute);
route.use("/token", tokenRoute);

export default route;
