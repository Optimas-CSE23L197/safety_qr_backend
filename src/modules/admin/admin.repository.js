import prisma from "../../config/prisma.js";

export const findAdminByEmail = async (email) => {
  return prisma.admin.findFirst({
    where: { email, is_active: true },
  });
};

export const findAdminById = async (id) => {
  return prisma.admin.findUnique({ where: { id } });
};

export const createAdminWithLog = async (adminData, logData) => {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.admin.create({ data: adminData });

    await tx.auditLog.create({
      data: {
        admin_id: logData.adminId,
        action: logData.action,
        entity: logData.entity,
        entity_id: admin.id,
        metadata: logData.metadata,
      },
    });

    return admin;
  });
};

export const updateAdminWithLog = async (adminId, data, logData) => {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.admin.update({
      where: { id: adminId },
      data,
    });

    await tx.auditLog.create({
      data: {
        admin_id: logData.adminId,
        action: logData.action,
        entity: logData.entity,
        entity_id: adminId,
        metadata: logData.metadata,
      },
    });

    return admin;
  });
};

export const softDeleteAdminWithLog = async (adminId, logData) => {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.admin.update({
      where: { id: adminId },
      data: {
        is_active: false,
        deleted_at: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        admin_id: logData.adminId,
        action: logData.action,
        entity: logData.entity,
        entity_id: adminId,
        metadata: logData.metadata,
      },
    });

    return admin;
  });
};
