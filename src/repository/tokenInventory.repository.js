import prisma from "../config/prisma.js";

export const getTokenInventory = async ({
  page = 1,
  limit = 25,
  search,
  status,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
    ...getTokenInventory(
      search && {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { student: { name: { contains: search, mode: "insensitive" } } },
        ],
      },
    ),
  };

  const [
    items,
    total,
    totalTokens,
    activeTokens,
    unassignedTokens,
    expiringSoon,
  ] = await Promise.all([
    prisma.token.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        student: { select: { name: true } },
        batch: { select: { name: true } },
      },
    }),

    prisma.token.count({ where }),

    prisma.token.count(),
    prisma.token.count({ where: { status: "ACTIVE" } }),
    prisma.token.count({ where: { student_id: null } }),
    prisma.token.count({
      where: {
        expires_at: {
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    stats: {
      totalTokens,
      activeTokens,
      expiringSoon,
      unassignedTokens,
    },

    items: items.map((t) => ({
      id: t.id,
      code: t.code,
      studentName: t.student?.name ?? null,
      batchName: t.batch?.name ?? null,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      status: t.status,
    })),

    pagination: { page, limit, total },
  };
};
