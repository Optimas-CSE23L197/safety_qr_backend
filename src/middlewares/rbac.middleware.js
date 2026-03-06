import { ERROR_MESSAGES, HTTP_STATUS } from "../config/constants.js";
import { ApiError } from "../utils/ApiError.js";

export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next(
        new ApiError(HTTP_STATUS.UNAUTHORIZED, ERROR_MESSAGES.UNAUTHENTICATED),
      );
    }

    const hasPermission = allowedRoles.includes(req.user.role);

    if (!hasPermission) {
      return next(
        new ApiError(HTTP_STATUS.FORBIDDEN, ERROR_MESSAGES.UNAUTHORIZED),
      );
    }

    return next();
  };
};
