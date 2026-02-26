import prisma from "../config/prisma.js";
export const getSchoolSummary = async (schoolId) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      code: true,
      is_active: true,
      address: true,
      contact_email: true,
      subscription_plan: true,
    },
  });

  if (!school) return null;

  const totalStudents = await prisma.student.count({
    where: {
      school_id: schoolId,
      deleted_at: null,
    },
  });

  return {
    ...school,
    totalStudents,
  };
};
