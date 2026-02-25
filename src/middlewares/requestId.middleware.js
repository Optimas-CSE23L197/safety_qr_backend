import { randomUUID } from "crypto";

export const requestId = (req, res, next) => {
  const id = req.headers["x-request-id"] ?? randomUUID();
  req.id = id;
  res.set("X-Request-Id", id);
  next();
};
