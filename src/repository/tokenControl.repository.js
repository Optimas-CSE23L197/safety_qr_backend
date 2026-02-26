import prisma from "../config/prisma.js";

export const getTokenDetails = async (tokenID) => {
  const token = await prisma.token.findUnique({
    where: { id: tokenID },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          school: {
            id: true,
            name: true,
          },
        },
      },
    },
  });

  if (!token) return null;

  const [totalScans, lastScan] = await Promise.all([
    prisma.scanLog.count({
      where: { token_id: tokenID },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    }),
  ]);

  return {
    id: token.id,
    code: token.code,
    status: token.status,

    student: token.student && {
      id: token.student.id,
      name: token.student.name,
    },

    school: token.student?.school && {
      id: token.student.school.id,
      name: token.student.school.name,
    },

    lifecycle: {
      issuedAt: token.issued_at,
      activatedAt: token.activated_at,
      expiresAt: token.expires_at,
    },

    activity: {
      totalScans,
      lastScanAt: lastScan?.created_at ?? null,
    },

    riskLevel: "LOW",
  };
};
