import { HTTP_STATUS } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import * as studentRepo from "./student.repository.js";

export const checkStudentTokenLimit = async (studentId, maxTokens = 1) => {
  const activeToken = await studentRepo.studentTokenLimit(studentId);

  if (activeToken >= maxTokens) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      `Student already has ${activeCount} active token(s). Revoke existing token before generating a new one.`,
    );
  }
};
