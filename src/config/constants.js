//////////////////////////////
//! APP
//////////////////////////////

export const APP = {
  NAME: "qr-safety-backend",
  API_PREFIX: "/api/v1",
};

//////////////////////////////
//! ROLES (RBAC)
//////////////////////////////

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  SUPPORT: "SUPPORT",
};

//////////////////////////////
//! TOKEN STATUS (MATCHES PRISMA ENUM)
//////////////////////////////

export const TOKEN_STATUS = {
  UNASSIGNED: "UNASSIGNED",
  ISSUED: "ISSUED",
  ACTIVATED: "ACTIVATED",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  REPLACED: "REPLACED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
};

//////////////////////////////
//! SUBSCRIPTION STATUS
//////////////////////////////

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  PAST_DUE: "PAST_DUE",
};

//////////////////////////////
//! PAYMENT STATUS
//////////////////////////////

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
};

//////////////////////////////
//! PAGINATION
//////////////////////////////

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

//////////////////////////////
//! RATE LIMIT (PUBLIC SCAN)
//////////////////////////////

export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100,
};

//////////////////////////////
//! HTTP STATUS
//////////////////////////////

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL_ERROR: 500,
};

//////////////////////////////
//! ERROR MESSAGES
//////////////////////////////

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Unauthorized access",
  UNAUTHENTICATED: "Unauthenticated: Role not found",
  FORBIDDEN: "You don’t have permission to perform this action",
  NOT_FOUND: "Resource not found",
  INTERNAL_ERROR: "Internal server error",

  INVALID_INPUT: "Invalid input details",
  INVALID_CREDENTIALS: "Invalid email or password",
  TOKEN_EXPIRED: "Token has expired",
  TOKEN_REVOKED: "Token has been revoked",
  TOKEN_INVALID: "Invalid token",

  SCHOOL_NOT_ACTIVE: "School is not active",
  STUDENT_NOT_FOUND: "Student not found",
  ADMIN_EXISTS: "Admin already exist",
  ADMIN_NOT_FOUND: "Admin not found",
  ADMIN_INACTIVE: "Admin is not active",
  SUBSCRIPTION_REQUIRED: "Active subscription required",

  EMAIL_ALREADY_USED: "Try with different email",

  ACCOUNT_DISABLED: "Account disabled",
};

//////////////////////////////
//! SUCCESS MESSAGES
//////////////////////////////

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: "Logged in successfully",
  LOGOUT_SUCCESS: "Logged out successfully",
  CREATED: "Resource created successfully",
  UPDATED: "Resource updated successfully",
  DELETED: "Resource deleted successfully",
  TOKEN_FOUND: "Token found",
};

//////////////////////////////
//! AUDIT ACTIONS
//////////////////////////////

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",

  CREATE_ADMIN: "CREATE_ADMIN",
  UPDATE_ADMIN: "UPDATE_ADMIN",

  CREATE_SCHOOL: "CREATE_SCHOOL",
  UPDATE_SCHOOL: "UPDATE_SCHOOL",

  CREATE_STUDENT: "CREATE_STUDENT",
  UPDATE_STUDENT: "UPDATE_STUDENT",

  ISSUE_TOKEN: "ISSUE_TOKEN",
  ACTIVATE_TOKEN: "ACTIVATE_TOKEN",
  REVOKE_TOKEN: "REVOKE_TOKEN",
  RESET_TOKEN: "RESET_TOKEN",

  CREATE_SUBSCRIPTION: "CREATE_SUBSCRIPTION",
  CANCEL_SUBSCRIPTION: "CANCEL_SUBSCRIPTION",

  GENERATE_CARD: "GENERATE_CARD",
};

//////////////////////////////
//! REPORT TYPES
//////////////////////////////

export const REPORT_TYPES = {
  SCANS: "SCANS",
  REVENUE: "REVENUE",
  CUSTOM: "CUSTOM",
};

//////////////////////////////
//! FEATURE FLAGS
//////////////////////////////

export const FEATURE_FLAGS = {
  ENABLE_BILLING: "ENABLE_BILLING",
  ENABLE_ANALYTICS: "ENABLE_ANALYTICS",
  ENABLE_PUBLIC_SCAN: "ENABLE_PUBLIC_SCAN",
};

//////////////////////////////
//! FILE UPLOAD LIMITS
//////////////////////////////

export const FILE_LIMITS = {
  MAX_PHOTO_SIZE_MB: 5,
  MAX_TEMPLATE_SIZE_MB: 10,
};

//////////////////////////////
//! QUEUE NAMES (BULLMQ)
//////////////////////////////

export const QUEUES = {
  EMAIL: "email-queue",
  SUBSCRIPTION: "subscription-queue",
  REPORTS: "reports-queue",
};
