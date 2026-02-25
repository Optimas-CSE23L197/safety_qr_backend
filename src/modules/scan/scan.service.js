import { createHmac } from "crypto";
import * as repo from "./scan.repository.js";
import {
  checkRateLimit,
  RATE_LIMIT_TIERS,
} from "../../middlewares/rateLimit.middleware.js";
import { decrypt } from "../../utils/encryption.js";
import { parseUserAgent } from "../../utils/userAgent.js";

// =============================================================================
// Constants
// =============================================================================

const TOKEN_SECRET = process.env.TOKEN_SECRET;
if (!TOKEN_SECRET) throw new Error("TOKEN_SECRET env variable is required");

const MIN_RESPONSE_MS = 200; // minimum response time — prevents timing attacks

// Anomaly thresholds
const ANOMALY_RULES = {
  TOKEN_SCANS_PER_MINUTE: 5, // same token scanned > 5x in 1 min
  IP_SCANS_PER_MINUTE: 20, // same IP scanning > 20 tokens in 1 min
  WINDOW_MS: 60 * 1000,
};

// =============================================================================
// Token hashing
//
// HMAC-SHA256 with server secret.
// The raw token lives only in the QR code — never in the DB.
// The hash is what we store and look up.
// =============================================================================

const hashToken = (rawToken) =>
  createHmac("sha256", TOKEN_SECRET).update(rawToken).digest("hex");

// =============================================================================
// Response time padding
//
// Ensures all code paths take at least MIN_RESPONSE_MS.
// Prevents timing attacks that could reveal whether a token exists.
// =============================================================================

const withTimePadding = async (startTime, fn) => {
  const result = await fn();
  const elapsed = Date.now() - startTime;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  }
  return result;
};

// =============================================================================
// Profile builder
//
// Applies visibility rules before returning data to the scanner.
// Never return raw encrypted values — always decrypt first.
//
// Visibility levels:
//   PUBLIC  — full profile (name, contacts, medical)
//   MINIMAL — name + contacts only, no medical
//   HIDDEN  — name + school contact only
// =============================================================================

const buildPublicProfile = (student, visibility) => {
  const profile = student.emergency;

  // Base — always returned regardless of visibility
  const base = {
    name:
      decrypt(student.first_name) +
      (student.last_name ? ` ${decrypt(student.last_name)}` : ""),
    class: student.class ?? null,
    section: student.section ?? null,
    photo_url: student.photo_url ?? null,
    school: {
      name: student.school.name,
      phone: student.school.phone ?? null,
    },
  };

  // HIDDEN or profile toggled off — school contact only
  if (visibility === "HIDDEN" || !profile?.is_visible) {
    return {
      ...base,
      message: "For emergency information, please contact the school directly.",
      contacts: [],
      medical: null,
    };
  }

  // Emergency contacts — included for MINIMAL and PUBLIC
  const contacts = (profile?.contacts ?? []).map((c) => ({
    name: decrypt(c.name),
    phone: decrypt(c.phone),
    relationship: c.relationship ? decrypt(c.relationship) : null,
    priority: c.priority,
  }));

  // MINIMAL — name + contacts, no medical data
  if (visibility === "MINIMAL") {
    return { ...base, contacts, medical: null };
  }

  // PUBLIC — full profile including medical
  return {
    ...base,
    contacts,
    medical: profile
      ? {
          blood_group: profile.blood_group
            ? decrypt(profile.blood_group)
            : null,
          allergies: profile.allergies
            ? JSON.parse(decrypt(profile.allergies))
            : [],
          conditions: profile.conditions ? decrypt(profile.conditions) : null,
          medications: profile.medications
            ? decrypt(profile.medications)
            : null,
          doctor_name: profile.doctor_name
            ? decrypt(profile.doctor_name)
            : null,
          doctor_phone: profile.doctor_phone
            ? decrypt(profile.doctor_phone)
            : null,
          notes: profile.notes ? decrypt(profile.notes) : null,
        }
      : null,
  };
};

// =============================================================================
// Anomaly detection
//
// Runs async after the response is sent — never blocks the scan.
// Creates ScanAnomaly records for the school dashboard to review.
// =============================================================================

const runAnomalyDetection = async (tokenId, ipAddress) => {
  try {
    const [tokenScanCount, ipScanCount] = await Promise.all([
      repo.countRecentScansForToken(tokenId, ANOMALY_RULES.WINDOW_MS),
      repo.countRecentScansFromIp(ipAddress, ANOMALY_RULES.WINDOW_MS),
    ]);

    const anomalies = [];

    if (tokenScanCount > ANOMALY_RULES.TOKEN_SCANS_PER_MINUTE) {
      anomalies.push(
        repo.createScanAnomaly(
          tokenId,
          `Token scanned ${tokenScanCount} times in 1 minute`,
          { count: tokenScanCount, window_ms: ANOMALY_RULES.WINDOW_MS },
        ),
      );
    }

    if (ipScanCount > ANOMALY_RULES.IP_SCANS_PER_MINUTE) {
      anomalies.push(
        repo.createScanAnomaly(
          tokenId,
          `IP ${ipAddress} scanned ${ipScanCount} different tokens in 1 minute`,
          { ip: ipAddress, count: ipScanCount },
        ),
      );
    }

    if (anomalies.length > 0) {
      await Promise.allSettled(anomalies);
    }
  } catch (err) {
    // Must never affect the scan result
    console.error("[ScanService] Anomaly detection error:", err.message);
  }
};

// =============================================================================
// Notification dispatch
//
// Queues notifications in DB — actual sending is handled by a worker.
// Never sends directly from the scan flow.
// =============================================================================

const dispatchScanNotifications = async (token, student, scanMeta) => {
  try {
    const [settings, lastScan, primaryParents] = await Promise.all([
      repo.getSchoolSettings(token.school_id),
      repo.getLastSuccessfulScan(token.id),
      repo.getPrimaryParentsForStudent(student.id),
    ]);

    if (!settings?.scan_notifications_enabled) return;

    // Cooldown check — avoid spamming parents on every scan
    if (!settings.notify_on_every_scan && lastScan) {
      const cooldownMs = settings.scan_alert_cooldown_mins * 60 * 1000;
      const timeSinceLast = Date.now() - lastScan.created_at.getTime();
      if (timeSinceLast < cooldownMs) return;
    }

    const notifications = primaryParents.flatMap((ps) => {
      const jobs = [];

      if (ps.parent.devices.length > 0) {
        jobs.push(
          repo.createNotification({
            schoolId: token.school_id,
            studentId: student.id,
            parentId: ps.parent.id,
            type: "SCAN_ALERT",
            channel: "PUSH",
            payload: {
              title: "Emergency ID Scanned",
              body: `${decrypt(student.first_name)}'s ID card was just scanned.`,
              scan_location: scanMeta.location ?? null,
              scanned_at: new Date().toISOString(),
              device_tokens: ps.parent.devices.map((d) => d.device_token),
            },
          }),
        );
      }

      return jobs;
    });

    if (notifications.length > 0) {
      await Promise.allSettled(notifications);
    }
  } catch (err) {
    console.error("[ScanService] Notification dispatch error:", err.message);
  }
};

// =============================================================================
// Location capture
// =============================================================================

const captureLocation = async (student, tokenId, locationData) => {
  try {
    if (!locationData?.latitude || !locationData?.longitude) return;

    const consent = await repo.getLocationConsent(student.id);
    if (!consent?.enabled) return;

    await repo.createLocationEvent({
      studentId: student.id,
      tokenId,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy: locationData.accuracy ?? null,
    });
  } catch (err) {
    console.error("[ScanService] Location capture error:", err.message);
  }
};

// =============================================================================
// Main scan handler
// =============================================================================

/**
 * @param {string} rawToken  - Raw token decoded from the QR code
 * @param {object} scanMeta  - IP, user agent, geo, location data
 * @returns {{ success: boolean, result: string, profile?: object, message?: string }}
 */
export const processScan = async (rawToken, scanMeta) => {
  const startTime = Date.now();
  const ipAddress = scanMeta.ipAddress ?? "unknown";
  const userAgent = scanMeta.userAgent ?? null;
  const device = userAgent ? parseUserAgent(userAgent) : null;

  return withTimePadding(startTime, async () => {
    // ----------------------------------------------------------------
    // Step 1: Per-token rate limit
    // Use raw token as key — never log the hash
    // ----------------------------------------------------------------
    const tokenRateLimit = await checkRateLimit(
      rawToken,
      RATE_LIMIT_TIERS.SCAN_TOKEN,
    );
    if (!tokenRateLimit.allowed) {
      console.warn(`[ScanService] Token rate limited — IP: ${ipAddress}`);
      return {
        success: false,
        result: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
      };
    }

    // ----------------------------------------------------------------
    // Step 2: Hash token and look up in DB
    // ----------------------------------------------------------------
    const tokenHash = hashToken(rawToken);
    const token = await repo.findTokenByHash(tokenHash);

    // ----------------------------------------------------------------
    // Step 3: Token not found
    // ----------------------------------------------------------------
    if (!token) {
      await repo.createScanLog({
        tokenId: null, // no real token to link
        result: "INVALID",
        ipAddress,
        userAgent,
        device,
        responseTimeMs: Date.now() - startTime,
      });
      return {
        success: false,
        result: "INVALID",
        message: "This QR code is not recognized.",
      };
    }

    // Base log data — shared across all remaining paths
    const logBase = {
      tokenId: token.id,
      ipAddress,
      ipCountry: scanMeta.ipCountry ?? null,
      ipCity: scanMeta.ipCity ?? null,
      latitude: scanMeta.location?.latitude ?? null,
      longitude: scanMeta.location?.longitude ?? null,
      userAgent,
      device,
    };

    // ----------------------------------------------------------------
    // Step 4: Check token status
    // Order matters — check permanent states before temporary ones
    // ----------------------------------------------------------------
    if (token.status === "REVOKED") {
      await repo.createScanLog({
        ...logBase,
        result: "REVOKED",
        responseTimeMs: Date.now() - startTime,
      });
      return {
        success: false,
        result: "REVOKED",
        message: "This card has been deactivated. Please contact the school.",
      };
    }

    if (token.status === "INACTIVE") {
      await repo.createScanLog({
        ...logBase,
        result: "INACTIVE",
        responseTimeMs: Date.now() - startTime,
      });
      return {
        success: false,
        result: "INACTIVE",
        message:
          "This card is temporarily inactive. Please contact the school.",
      };
    }

    if (
      token.status === "EXPIRED" ||
      (token.expires_at && token.expires_at < new Date())
    ) {
      await repo.createScanLog({
        ...logBase,
        result: "EXPIRED",
        responseTimeMs: Date.now() - startTime,
      });
      return {
        success: false,
        result: "EXPIRED",
        message:
          "This card has expired. Please contact the school for a replacement.",
      };
    }

    if (
      token.status === "UNASSIGNED" ||
      token.status === "ISSUED" ||
      !token.student
    ) {
      await repo.createScanLog({
        ...logBase,
        result: "INVALID",
        responseTimeMs: Date.now() - startTime,
      });
      return {
        success: false,
        result: "INVALID",
        message: "This QR code is not yet activated.",
      };
    }

    // ----------------------------------------------------------------
    // Step 5: SUCCESS — build profile and fire async jobs
    // ----------------------------------------------------------------
    const student = token.student;
    const visibility = student.emergency?.visibility ?? "PUBLIC";

    await repo.createScanLog({
      ...logBase,
      result: "SUCCESS",
      responseTimeMs: Date.now() - startTime,
    });

    const profile = buildPublicProfile(student, visibility);

    // Fire async — must never block or fail the scan response
    setImmediate(() => {
      runAnomalyDetection(token.id, ipAddress);
      dispatchScanNotifications(token, student, scanMeta);
      captureLocation(student, token.id, scanMeta.location);
    });

    return {
      success: true,
      result: "SUCCESS",
      profile,
      scannedAt: new Date().toISOString(),
    };
  });
};
