import { HTTP_STATUS, SUCCESS_MESSAGES } from "../../config/constants.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as adminService from "./admin.service.js";

export const registerAdminController = asyncHandler(async (req, res) => {
  const admin = await adminService.adminRegistration(req.body, req.user);

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: SUCCESS_MESSAGES.CREATED,
    data: admin,
  });
});

export const updateAdminController = asyncHandler(async (req, res) => {
  const admin = await adminService.adminUpdate(
    req.params.adminId,
    req.body,
    req.user,
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: SUCCESS_MESSAGES.UPDATED,
    data: admin,
  });
});

export const deleteAdminController = asyncHandler(async (req, res) => {
  const admin = await adminService.adminDelete(req.params.adminId, req.user);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: SUCCESS_MESSAGES.DELETED,
    data: admin,
  });
});
