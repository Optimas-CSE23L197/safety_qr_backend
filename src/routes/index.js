import { Router } from "express";
const route = Router();

// auth route
import authRoute from "../modules/auth/auth.routes.js";
import qrRoute from "../modules/qr_id/qr.routes.js";
import schoolRoutes from "../modules/school/school.routes.js";
import studenRoutes from "../modules/student/student.routes.js";

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
route.use("/qr", qrRoute);
route.use("/schools", schoolRoutes);
route.use("/schools/:schoolId/students",studenRoutes);

export default route;
