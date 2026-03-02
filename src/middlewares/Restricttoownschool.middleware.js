import { ApiError } from "../utils/ApiError.js";
import { HTTP_STATUS, ROLES } from "../constants.js";

/**
 * restrictToOwnSchool
 *
 * Used on GET school routes to enforce:
 *   - SUPER_ADMIN  → can read ANY school (pass through)
 *   - SCHOOL_ADMIN → can ONLY read their own school (req.user.school_id must
 *                    match the requested resource's school ID)
 *
 * Expects requireAuth to have already run and attached req.user:
 *   req.user = {
 *     id:        string,
 *     role:      "SUPER_ADMIN" | "SCHOOL_ADMIN" | ...
 *     school_id: string | null   ← null for SUPER_ADMIN
 *   }
 *
 * Usage:
 *   router.get("/:id", validate(...), restrictToOwnSchool, controller)
 *
 * How the school ID is resolved (in order):
 *   1. req.params.id   — for GET /schools/:id
 *   2. req.params.code — for GET /schools/code/:code (resolved after DB lookup,
 *                        so we attach the resolved school onto req for the controller)
 *   For GET /schools (list) — SCHOOL_ADMIN is force-filtered to own school only
 *   via req.schoolFilter which the controller reads instead of parsedQuery.
 */
export const restrictToOwnSchool = (req, res, next) => {
  const user = req.user;

  // SUPER_ADMIN bypasses all school ownership checks
  if (user.role === ROLES.SUPER_ADMIN) {
    return next();
  }

  // From here: SCHOOL_ADMIN only
  // They must have a school_id on their token
  if (!user.school_id) {
    return next(
      new ApiError(
        HTTP_STATUS.FORBIDDEN,
        "No school associated with this account",
      ),
    );
  }

  // --- GET /schools/:id ---
  if (req.params.id) {
    if (req.params.id !== user.school_id) {
      return next(
        new ApiError(
          HTTP_STATUS.FORBIDDEN,
          "You can only access your own school",
        ),
      );
    }
    return next();
  }

  // --- GET /schools/code/:code ---
  // We can't compare code vs school_id here without a DB lookup.
  // Attach the user's school_id as a filter — the service will enforce it.
  if (req.params.code) {
    req.ownSchoolId = user.school_id; // service checks this after code lookup
    return next();
  }

  // --- GET /schools (list) ---
  // Force-filter the list to only return the admin's own school
  req.ownSchoolId = user.school_id;
  return next();
};
