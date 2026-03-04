import { ZodError } from "zod";

export const validate = (schemas = {}) => {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.assign(req.params, parsed);
      }

      if (schemas.query) {
        // req.query is getter-only and backed by URLSearchParams in some
        // Express/router versions — mutating it is unreliable.
        // Store parsed + coerced query on req.parsedQuery instead.
        // Controllers must read from req.parsedQuery (not req.query).
        req.parsedQuery = schemas.query.parse(req.query);
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: err.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
      }

      next(err);
    }
  };
};
