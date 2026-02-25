import prisma from "../../config/prisma.js";

// =============================================================================
// Scan Repository
// All raw database operations for the scan flow.
// No business logic here — just data access.
// =============================================================================

/**
 * Find a token by its hash.
 * Includes the student's emergency profile and ordered contacts.
 * Called on every public scan.
 */
export const findTokenByHash = async (tokenHash) => {
  return prisma.token.findUnique({
    where: { token_hash: tokenHash },
    select: {
      id: true,
      status: true,
      expires_at: true,
      student_id: true,
      school_id: true,
      student: {
        select: {
          id: true,
          first_name: true, // [ENCRYPTED] — decrypt in service layer
          last_name: true, // [ENCRYPTED]
          class: true,
          section: true,
          photo_url: true,
          is_active: true,
          school: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          emergency: {
            select: {
              blood_group: true, // [ENCRYPTED]
              allergies: true, // [ENCRYPTED]
              conditions: true, // [ENCRYPTED]
              medications: true, // [ENCRYPTED]
              doctor_name: true, // [ENCRYPTED]
              doctor_phone: true, // [ENCRYPTED]
              notes: true, // [ENCRYPTED]
              visibility: true,
              is_visible: true,
              contacts: {
                where: { is_active: true },
                orderBy: { priority: "asc" },
                select: {
                  id: true,
                  name: true, // [ENCRYPTED]
                  phone: true, // [ENCRYPTED]
                  relationship: true, // [ENCRYPTED]
                  priority: true,
                },
              },
            },
          },
        },
      },
    },
  });
};

/**
 * Write a scan log entry.
 * Called for EVERY scan attempt regardless of result.
 *
 * token_id is nullable — INVALID scans have no matching token in the DB.
 * Schema must have token_id as String? for this to work.
 */
export const createScanLog = async (data) => {
  return prisma.scanLog.create({
    data: {
      // null for INVALID scans — token didn't exist in DB
      token_id: data.tokenId !== "unknown" ? data.tokenId : null,
      result: data.result,
      ip_address: data.ipAddress ?? null,
      ip_country: data.ipCountry ?? null,
      ip_city: data.ipCity ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      user_agent: data.userAgent ?? null,
      device: data.device ?? null,
      response_time_ms: data.responseTimeMs ?? null,
    },
  });
};

/**
 * Count recent scans for a token within a time window.
 * Used for per-token anomaly detection.
 */
export const countRecentScansForToken = async (tokenId, windowMs) => {
  const since = new Date(Date.now() - windowMs);
  return prisma.scanLog.count({
    where: {
      token_id: tokenId,
      created_at: { gte: since },
    },
  });
};

/**
 * Count recent SUCCESS scans from an IP within a time window.
 * Used to detect harvesting attacks — one IP scanning many different tokens.
 */
export const countRecentScansFromIp = async (ipAddress, windowMs) => {
  const since = new Date(Date.now() - windowMs);
  return prisma.scanLog.count({
    where: {
      ip_address: ipAddress,
      created_at: { gte: since },
      result: "SUCCESS",
    },
  });
};

/**
 * Write an anomaly record.
 * Called async — never blocks the scan response.
 */
export const createScanAnomaly = async (tokenId, reason, metadata = {}) => {
  return prisma.scanAnomaly.create({
    data: {
      token_id: tokenId,
      reason,
      metadata,
    },
  });
};

/**
 * Record a location event triggered by a QR scan.
 * Only called when LocationConsent is enabled for the student.
 */
export const createLocationEvent = async (data) => {
  return prisma.locationEvent.create({
    data: {
      student_id: data.studentId,
      token_id: data.tokenId ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy ?? null,
      source: "SCAN_TRIGGER",
    },
  });
};

/**
 * Check if location sharing is consented for a student.
 */
export const getLocationConsent = async (studentId) => {
  return prisma.locationConsent.findUnique({
    where: { student_id: studentId },
    select: { enabled: true },
  });
};

/**
 * Queue a notification record.
 * The actual sending is handled by a separate notification worker.
 */
export const createNotification = async (data) => {
  return prisma.notification.create({
    data: {
      school_id: data.schoolId,
      student_id: data.studentId,
      parent_id: data.parentId ?? null,
      type: data.type,
      channel: data.channel,
      status: "QUEUED",
      payload: data.payload,
    },
  });
};

/**
 * Get primary parents for a student to notify on scan.
 * Includes their active push notification device tokens.
 */
export const getPrimaryParentsForStudent = async (studentId) => {
  return prisma.parentStudent.findMany({
    where: {
      student_id: studentId,
      is_primary: true,
    },
    select: {
      parent_id: true,
      parent: {
        select: {
          id: true,
          devices: {
            where: { is_active: true },
            select: {
              device_token: true,
              platform: true,
            },
          },
        },
      },
    },
  });
};

/**
 * Get school notification settings.
 * Used to decide whether and how to notify parents on scan.
 */
export const getSchoolSettings = async (schoolId) => {
  return prisma.schoolSettings.findUnique({
    where: { school_id: schoolId },
    select: {
      scan_notifications_enabled: true,
      notify_on_every_scan: true,
      scan_alert_cooldown_mins: true,
    },
  });
};

/**
 * Get the most recent successful scan for a token.
 * Used for notification cooldown — avoids spamming parents on every scan.
 */
export const getLastSuccessfulScan = async (tokenId) => {
  return prisma.scanLog.findFirst({
    where: {
      token_id: tokenId,
      result: "SUCCESS",
    },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });
};
