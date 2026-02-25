import prisma from "../config/prisma.js";

export const auditLog = async ({
  schoolId,
  actorType,
  actorId,
  action,
  entity,
  entityId,
  oldValue,
  newValue,
  ipAddress,
}) => {
  // fire and forget — never block the main operation
  prisma.auditLog
    .create({
      data: {
        school_id: schoolId ?? null,
        actor_type: actorType,
        actor_id: actorId,
        action, // "CREATE" | "UPDATE" | "DELETE" | "REVOKE"
        entity, // "Token" | "Student" | "Card"
        entity_id: entityId,
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
        ip_address: ipAddress ?? null,
      },
    })
    .catch((err) =>
      logger.error("[AuditLog] Failed to write audit log:", err.message),
    );
};
