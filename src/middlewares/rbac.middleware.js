import { ERROR_MESSAGES, HTTP_STATUS } from "../config/constants.js";
import { ApiError } from "../utils/ApiError.js";

export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    // ensure user is authenticated
    if (!req.user || !req.user.role) {
      return next(
        ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHENTICATED),
      );
    }

    //   check user's role is in allowed list
    const hasPermission = allowedRoles.includes(req.user.role);

    if (!hasPermission) {
      return next(ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.UNAUTHORIZED));
    }

    return next();
  };
};
