import prisma from "../../config/prisma.js";

export const findSchoolById = async (schoolId) => {
  return await prisma.school.findUnique({
    where: { id: schoolId },
    include: { settings: true },
  });
};
