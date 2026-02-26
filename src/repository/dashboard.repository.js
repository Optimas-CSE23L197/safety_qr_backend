// dashboard.service.js
import prisma from "../config/prisma.js";

import {
  startOfDay,
  subDays,
  startOfMonth,
  subMonths,
  eachDayOfInterval,
  format,
} from "date-fns";

export const getDashboardData = async (range = "24h") => {
  const now = new Date();
  const today = startOfDay(now);

  // ── Calculate date ranges for growth % ──────────────
  const rangeMap = {
    "24h": { current: subDays(now, 1), previous: subDays(now, 2) },
    "7d": { current: subDays(now, 7), previous: subDays(now, 14) },
    "30d": { current: subDays(now, 30), previous: subDays(now, 60) },
    "90d": { current: subDays(now, 90), previous: subDays(now, 180) },
  };

  const { current: rangeStart, previous: prevStart } = rangeMap[range];

  const [
    // ── Stat Cards ────────────────────────────────────
    totalSchools,
    totalSchoolsPrev,
    totalStudents,
    totalStudentsPrev,
    totalActiveTokens,
    totalActiveTokensPrev,
    totalScansNow,
    totalScansPrev,

    // ── Token Distribution ────────────────────────────
    tokenDistribution,

    // ── Scan Activity Chart ───────────────────────────
    scanActivity,

    // ── Recent Schools ────────────────────────────────
    recentSchools,

    // ── Alerts ────────────────────────────────────────
    expiringSubscriptions,
    revokedTokensThisWeek,
    unresolvedAnomalies,
  ] = await Promise.all([
    // ── Stat Cards ────────────────────────────────────
    prisma.school.count({
      where: { is_active: true },
    }),
    prisma.school.count({
      where: { is_active: true, created_at: { lt: rangeStart } },
    }),

    prisma.student.count({
      where: { is_active: true, deleted_at: null },
    }),
    prisma.student.count({
      where: {
        is_active: true,
        deleted_at: null,
        created_at: { lt: rangeStart },
      },
    }),

    prisma.token.count({
      where: { status: "ACTIVE" },
    }),
    prisma.token.count({
      where: { status: "ACTIVE", created_at: { lt: rangeStart } },
    }),

    prisma.scanLog.count({
      where: { created_at: { gte: rangeStart } },
    }),
    prisma.scanLog.count({
      where: { created_at: { gte: prevStart, lt: rangeStart } },
    }),

    // ── Token Distribution ────────────────────────────
    prisma.token.groupBy({
      by: ["status"],
      _count: { status: true },
    }),

    // ── Scan Activity Chart (raw grouped by day) ──────
    prisma.scanLog.groupBy({
      by: ["created_at"],
      where: { created_at: { gte: rangeStart } },
      _count: { id: true },
      orderBy: { created_at: "asc" },
    }),

    // ── Recent Schools ─────────────────────────────────
    prisma.school.findMany({
      where: { is_active: true },
      orderBy: { created_at: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        logo_url: true,
        created_at: true,
        _count: { select: { students: true } },
        subscriptions: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { status: true, plan: true },
        },
      },
    }),

    // ── Alerts ────────────────────────────────────────
    prisma.subscription.count({
      where: {
        status: "ACTIVE",
        current_period_end: { lte: subDays(now, -7) }, // expiring in 7 days
      },
    }),
    prisma.token.count({
      where: {
        status: "REVOKED",
        revoked_at: { gte: subDays(now, 7) },
      },
    }),
    prisma.scanAnomaly.count({
      where: { resolved: false },
    }),
  ]);

  // ── Calculate growth % ────────────────────────────────
  const growth = (current, previous) => {
    if (previous === 0) return 100;
    return +(((current - previous) / previous) * 100).toFixed(1);
  };

  // ── Shape token distribution ──────────────────────────
  const tokenMap = {};
  tokenDistribution.forEach((t) => (tokenMap[t.status] = t._count.status));
  const totalTokens = Object.values(tokenMap).reduce((a, b) => a + b, 0);

  // ── Shape scan chart data by day ──────────────────────
  const scansByDay = {};
  scanActivity.forEach((s) => {
    const day = format(new Date(s.created_at), "yyyy-MM-dd");
    scansByDay[day] = (scansByDay[day] || 0) + s._count.id;
  });
  const chartData = Object.entries(scansByDay).map(([date, scans]) => ({
    date,
    scans,
  }));

  // ── Shape alerts ──────────────────────────────────────
  const alerts = [];
  if (expiringSubscriptions > 0)
    alerts.push({
      type: "warning",
      message: `${expiringSubscriptions} contracts expiring in 7 days`,
    });
  if (revokedTokensThisWeek > 0)
    alerts.push({
      type: "error",
      message: `${revokedTokensThisWeek} revoked tokens this week`,
    });
  if (unresolvedAnomalies > 0)
    alerts.push({
      type: "info",
      message: `${unresolvedAnomalies} unresolved scan anomalies`,
    });

  return {
    stats: {
      totalSchools: {
        value: totalSchools,
        growth: growth(totalSchools, totalSchoolsPrev),
      },
      totalStudents: {
        value: totalStudents,
        growth: growth(totalStudents, totalStudentsPrev),
      },
      activeTokens: {
        value: totalActiveTokens,
        growth: growth(totalActiveTokens, totalActiveTokensPrev),
      },
      scansToday: {
        value: totalScansNow,
        growth: growth(totalScansNow, totalScansPrev),
      },
    },
    tokenDistribution: {
      activated: {
        count: tokenMap["ACTIVE"] || 0,
        percent: +(((tokenMap["ACTIVE"] || 0) / totalTokens) * 100).toFixed(1),
      },
      issued: {
        count: tokenMap["ISSUED"] || 0,
        percent: +(((tokenMap["ISSUED"] || 0) / totalTokens) * 100).toFixed(1),
      },
      expired: {
        count: tokenMap["EXPIRED"] || 0,
        percent: +(((tokenMap["EXPIRED"] || 0) / totalTokens) * 100).toFixed(1),
      },
      revoked: {
        count: tokenMap["REVOKED"] || 0,
        percent: +(((tokenMap["REVOKED"] || 0) / totalTokens) * 100).toFixed(1),
      },
      total: totalTokens,
    },
    scanChart: chartData,
    recentSchools: recentSchools.map((s) => ({
      id: s.id,
      name: s.name,
      logo_url: s.logo_url,
      studentCount: s._count.students,
      subscription: s.subscriptions[0] ?? null,
      joinedAt: s.created_at,
    })),
    alerts,
  };
};
