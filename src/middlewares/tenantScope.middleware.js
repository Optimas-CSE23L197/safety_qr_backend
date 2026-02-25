import { HTTP_STATUS } from "../config/constants.js";
import { ApiError } from "../utils/ApiError.js";

export const scopeToTenant = (req, res, next) => {
  if (req.user?.school_id) {
    req.tenantId = req.user.school_id;
  } else {
    return next(new ApiError(HTTP_STATUS.FORBIDDEN, "Tenant context missing"));
  }

  return next();
};
