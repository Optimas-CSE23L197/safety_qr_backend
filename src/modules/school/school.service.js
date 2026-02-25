import { ERROR_MESSAGES, HTTP_STATUS } from "../../config/constants";
import { ApiError } from "../../utils/ApiError.js";
import * as schoolRepo from "./school.repository.js";

/**
 * Validate that a school exists and is active.
 * Throws ApiError if not found or inactive.
 * @param {string} schoolId
 * @returns {object} school with settings
 */
export const validateSchool = async (schoolId) => {
  const school = await schoolRepo.findSchoolById(schoolId);

  if (!school) {
    throw new ApiError(HTTP_STATUS.NOT_FOUND, "School not found");
  }

  if (!school.is_active) {
    throw new ApiError(HTTP_STATUS.FORBIDDEN, "School account is inactive");
  }

  return school;
};
