import prisma from "../../../config/prisma.js";

// ---------------------------------------------------------------------------
// Field selections
// ---------------------------------------------------------------------------

const schoolListFields = {
  id: true,
  name: true,
  code: true,
  email: true,
  phone: true,
  city: true,
  country: true,
  timezone: true,
  logo_url: true,
  is_active: true,
  created_at: true,
  updated_at: true,
  subscriptions: {
    select: {
      id: true,
      plan: true,
      status: true,
      trial_ends_at: true,
      current_period_end: true,
    },
    orderBy: { created_at: "desc" },
    take: 1,
  },
};

const schoolDetailFields = {
  ...schoolListFields,
  address: true,
  settings: {
    select: {
      allow_location: true,
      allow_parent_edit: true,
      scan_notifications_enabled: true,
      notify_on_every_scan: true,
      scan_alert_cooldown_mins: true,
      token_validity_months: true,
      max_tokens_per_student: true,
      default_profile_visibility: true,
    },
  },
  _count: {
    select: {
      students: true,
      users: true,
      tokens: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Uniqueness checks (used by service for pre-flight validation)
// ---------------------------------------------------------------------------

export const findSchoolByCode = async (code) => {
  return prisma.school.findUnique({
    where: { code },
    select: { id: true, code: true },
  });
};

export const findSchoolUserByEmail = async (email) => {
  return prisma.schoolUser.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
};

export const findSchoolById = async (id) => {
  return prisma.school.findUnique({
    where: { id },
    select: schoolDetailFields,
  });
};

// ---------------------------------------------------------------------------
// Register school — single transaction: School + Settings + SchoolUser + Subscription
// Password must already be hashed before calling this function (done in service)
// ---------------------------------------------------------------------------

export const createSchoolWithAdmin = async ({
  schoolData,
  adminData, // adminData.password_hash — already hashed
  subscriptionData,
}) => {
  return prisma.$transaction(async (tx) => {
    // 1. Create school + auto-create default settings via nested write
    const school = await tx.school.create({
      data: {
        name: schoolData.name,
        code: schoolData.code,
        email: schoolData.email || null,
        phone: schoolData.phone || null,
        address: schoolData.address || null,
        city: schoolData.city || null,
        country: schoolData.country ?? "IN",
        timezone: schoolData.timezone ?? "Asia/Kolkata",
        settings: { create: {} }, // all defaults from schema
      },
    });

    // 2. Create school admin user (password already hashed in service)
    const schoolUser = await tx.schoolUser.create({
      data: {
        school_id: school.id,
        name: adminData.name,
        email: adminData.email,
        password_hash: adminData.password_hash,
        role: adminData.role ?? "ADMIN",
        is_active: true,
      },
    });

    // 3. Create subscription stub
    // provider is required in schema — use "MANUAL" until billing is wired
    const now = new Date();
    const trialDays = subscriptionData.trialDays ?? 14;

    const trial_ends_at =
      trialDays > 0
        ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
        : null;

    // If no trial, first period = 30 days from now (placeholder until real billing)
    const current_period_end =
      trial_ends_at ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subscription = await tx.subscription.create({
      data: {
        school_id: school.id,
        plan: subscriptionData.plan ?? "growth",
        status: trialDays > 0 ? "TRIALING" : "ACTIVE",
        provider: "MANUAL", // placeholder — update when Razorpay is wired
        trial_ends_at,
        current_period_start: now,
        current_period_end,
      },
    });

    // 4. Return — never expose password_hash
    return {
      school: {
        id: school.id,
        name: school.name,
        code: school.code,
        email: school.email,
        phone: school.phone,
        city: school.city,
        country: school.country,
        timezone: school.timezone,
        is_active: school.is_active,
        created_at: school.created_at,
      },
      admin: {
        id: schoolUser.id,
        name: schoolUser.name,
        email: schoolUser.email,
        role: schoolUser.role,
      },
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        trial_ends_at: subscription.trial_ends_at,
        current_period_end: subscription.current_period_end,
      },
    };
  });
};

// ---------------------------------------------------------------------------
// Get all schools — paginated, filterable, sortable
// ---------------------------------------------------------------------------

const ALLOWED_SORT_FIELDS = [
  "created_at",
  "updated_at",
  "name",
  "code",
  "city",
];

export const getAllSchools = async ({
  page = 1,
  limit = 20,
  search,
  is_active,
  sortBy = "created_at",
  sortOrder = "desc",
} = {}) => {
  const skip = (page - 1) * limit;

  // Sanitize sortBy to prevent injection
  const orderField = ALLOWED_SORT_FIELDS.includes(sortBy)
    ? sortBy
    : "created_at";

  const where = {
    ...(typeof is_active === "boolean" && { is_active }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { country: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [schools, total] = await prisma.$transaction([
    prisma.school.findMany({
      where,
      select: schoolListFields,
      orderBy: { [orderField]: sortOrder },
      skip,
      take: limit,
    }),
    prisma.school.count({ where }),
  ]);

  return { schools, total };
};

// ---------------------------------------------------------------------------
// Get single school by ID — full detail view
// ---------------------------------------------------------------------------

export const getSchoolDetail = async (id) => {
  return prisma.school.findUnique({
    where: { id },
    select: schoolDetailFields,
  });
};

// ---------------------------------------------------------------------------
// Toggle school active status
// Deactivate also revokes all active sessions for school users
// ---------------------------------------------------------------------------

export const setSchoolActiveStatus = async (id, is_active) => {
  const ops = [
    prisma.school.update({
      where: { id },
      data: { is_active },
      select: {
        id: true,
        name: true,
        code: true,
        is_active: true,
        updated_at: true,
      },
    }),
  ];

  // On deactivation: revoke all sessions belonging to this school's users
  if (!is_active) {
    ops.push(
      prisma.session.deleteMany({
        where: { schoolUser: { school_id: id } },
      }),
    );
  }

  const [school] = await prisma.$transaction(ops);
  return school;
};
