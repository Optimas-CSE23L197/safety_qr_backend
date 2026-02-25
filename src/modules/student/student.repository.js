import prisma from "../../config/prisma.js";

export const studentTokenLimit = async (studentId) => {
  return await prisma.token.count({
    where: {
      student_id: studentId,
      status: { in: ["ACTIVATED", "INACTIVE"] },
    },
  });
};
