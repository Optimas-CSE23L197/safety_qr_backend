import prisma from "../config/prisma.js";

export const getScanLogs = async ({
  page = 1,
  limit = 20,
  search,
  result,
  from,
  to,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(result && { result }),
    ...(from &&
      to && {
        created_at: { gte: new Date(from), lte: new Date(to) },
      }),
    ...(search && {
      OR: [
        { token: { code: { contains: search, mode: "insensitive" } } },
        { student: { name: { contains: search, mode: "insensitive" } } },
        { ip_address: { contains: search } },
      ],
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.scanLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        token: { select: { code: true } },
        student: { select: { name: true, school: { select: { name: true } } } },
      },
    }),
    prisma.scanLog.count({ where }),
  ]);

  return {
    items: logs.map((l) => ({
      id: l.id,
      tokenCode: l.token?.code,
      studentName: l.student?.name ?? null,
      schoolName: l.student?.school?.name ?? null,
      result: l.result,
      timestamp: l.created_at,
      location: l.location,
      responseMs: l.response_ms,
    })),
    pagination: { page, limit, total },
  };
};
