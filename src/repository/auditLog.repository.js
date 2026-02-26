import prisma from "../config/prisma.js";

export const getAuditlogs = async ({
  page = 1,
  limit = 20,
  search,
  actorType,
  action,
  from,
  to,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(actorType && { actor_type: actorType }),
    ...(action && { action }),
    ...(from &&
      to && {
        created_at: { gte: new Date(from), lte: new Date(to) },
      }),
    ...(search && {
      OR: [
        { actor_name: { contains: search, mode: "insensitive" } },
        { entity: { contains: search, mode: "insensitive" } },
        { entity_id: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: logs.map((l) => ({
      id: l.id,
      actorName: l.actor_name,
      actorType: l.actor_type,
      action: l.action,
      entity: l.entity,
      entityId: l.entity_id,
      timestamp: l.created_at,
    })),
    pagination: { page, limit, total },
  };
};
