/*
  Warnings:

  - The values [CANCELLED] on the enum `SubscriptionStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ACTIVATED,REPLACED] on the enum `TokenStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `admin_id` on the `AuditLog` table. All the data in the column will be lost.
  - The primary key for the `BlacklistToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `token` on the `BlacklistToken` table. All the data in the column will be lost.
  - You are about to drop the column `template_id` on the `Card` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `ScanLog` table. All the data in the column will be lost.
  - The primary key for the `ScanRateLimit` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `ScanRateLimit` table. All the data in the column will be lost.
  - You are about to drop the column `contact_email` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `contact_phone` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `plan_name` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `Subscription` table. All the data in the column will be lost.
  - You are about to drop the column `issued_at` on the `Token` table. All the data in the column will be lost.
  - You are about to drop the `Admin` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Parent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RefreshToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StudentParent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Template` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[card_number]` on the table `Card` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider_ref]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `School` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider_sub_id]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `actor_id` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actor_type` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Made the column `entity_id` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `token_hash` to the `BlacklistToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `card_number` to the `Card` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `FeatureFlag` table without a default value. This is not possible if the table is not empty.
  - Made the column `subscription_id` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `result` to the `ScanLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `code` to the `School` table without a default value. This is not possible if the table is not empty.
  - Added the required column `first_name` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `current_period_end` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `current_period_start` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plan` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provider` to the `Subscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SchoolRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('SUCCESS', 'INVALID', 'REVOKED', 'EXPIRED', 'INACTIVE', 'RATE_LIMITED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SCAN_ALERT', 'SCAN_ANOMALY', 'CARD_EXPIRING', 'CARD_REVOKED', 'CARD_REPLACED', 'BILLING_ALERT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SCHOOL_USER', 'PARENT_USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MINIMAL', 'HIDDEN');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('SCAN_TRIGGER', 'PARENT_APP', 'MANUAL');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionStatus_new" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
ALTER TABLE "public"."Subscription" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "status" TYPE "SubscriptionStatus_new" USING ("status"::text::"SubscriptionStatus_new");
ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
DROP TYPE "public"."SubscriptionStatus_old";
ALTER TABLE "Subscription" ALTER COLUMN "status" SET DEFAULT 'TRIALING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TokenStatus_new" AS ENUM ('UNASSIGNED', 'ISSUED', 'ACTIVE', 'INACTIVE', 'REVOKED', 'EXPIRED');
ALTER TABLE "public"."Token" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Token" ALTER COLUMN "status" TYPE "TokenStatus_new" USING ("status"::text::"TokenStatus_new");
ALTER TYPE "TokenStatus" RENAME TO "TokenStatus_old";
ALTER TYPE "TokenStatus_new" RENAME TO "TokenStatus";
DROP TYPE "public"."TokenStatus_old";
ALTER TABLE "Token" ALTER COLUMN "status" SET DEFAULT 'UNASSIGNED';
COMMIT;

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "Card" DROP CONSTRAINT "Card_template_id_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "StudentParent" DROP CONSTRAINT "StudentParent_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "StudentParent" DROP CONSTRAINT "StudentParent_student_id_fkey";

-- DropForeignKey
ALTER TABLE "Template" DROP CONSTRAINT "Template_school_id_fkey";

-- DropForeignKey
ALTER TABLE "Token" DROP CONSTRAINT "Token_student_id_fkey";

-- DropIndex
DROP INDEX "AuditLog_entity_idx";

-- DropIndex
DROP INDEX "Card_template_id_idx";

-- DropIndex
DROP INDEX "ScanRateLimit_ip_address_idx";

-- DropIndex
DROP INDEX "Student_school_id_created_at_idx";

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "admin_id",
ADD COLUMN     "actor_id" TEXT NOT NULL,
ADD COLUMN     "actor_type" "ActorType" NOT NULL,
ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "new_value" JSONB,
ADD COLUMN     "old_value" JSONB,
ADD COLUMN     "school_id" TEXT,
ALTER COLUMN "entity_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "BlacklistToken" DROP CONSTRAINT "BlacklistToken_pkey",
DROP COLUMN "token",
ADD COLUMN     "token_hash" TEXT NOT NULL,
ADD CONSTRAINT "BlacklistToken_pkey" PRIMARY KEY ("token_hash");

-- AlterTable
ALTER TABLE "Card" DROP COLUMN "template_id",
ADD COLUMN     "card_number" TEXT NOT NULL,
ADD COLUMN     "print_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "printed_at" TIMESTAMP(3),
ADD COLUMN     "token_id" TEXT;

-- AlterTable
ALTER TABLE "FeatureFlag" ADD COLUMN     "description" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "subscription_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScanLog" DROP COLUMN "location",
ADD COLUMN     "ip_city" TEXT,
ADD COLUMN     "ip_country" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "response_time_ms" INTEGER,
ADD COLUMN     "result" "ScanResult" NOT NULL,
ADD COLUMN     "user_agent" TEXT;

-- AlterTable
ALTER TABLE "ScanRateLimit" DROP CONSTRAINT "ScanRateLimit_pkey",
DROP COLUMN "id",
ADD COLUMN     "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "ScanRateLimit_pkey" PRIMARY KEY ("ip_address");

-- AlterTable
ALTER TABLE "School" DROP COLUMN "contact_email",
DROP COLUMN "contact_phone",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia';

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "name",
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "dob_encrypted" TEXT,
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "section" TEXT;

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "end_date",
DROP COLUMN "plan_name",
DROP COLUMN "start_date",
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "current_period_end" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "current_period_start" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "plan" TEXT NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "provider_sub_id" TEXT,
ADD COLUMN     "trial_ends_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'TRIALING';

-- AlterTable
ALTER TABLE "Token" DROP COLUMN "issued_at",
ADD COLUMN     "activated_at" TIMESTAMP(3),
ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "batch_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ALTER COLUMN "student_id" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'UNASSIGNED';

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "error" TEXT,
ADD COLUMN     "processed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "processed_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "Admin";

-- DropTable
DROP TABLE "Parent";

-- DropTable
DROP TABLE "RefreshToken";

-- DropTable
DROP TABLE "StudentParent";

-- DropTable
DROP TABLE "Template";

-- DropEnum
DROP TYPE "AdminRole";

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "allow_location" BOOLEAN NOT NULL DEFAULT false,
    "allow_parent_edit" BOOLEAN NOT NULL DEFAULT true,
    "scan_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_every_scan" BOOLEAN NOT NULL DEFAULT false,
    "scan_alert_cooldown_mins" INTEGER NOT NULL DEFAULT 60,
    "token_validity_months" INTEGER NOT NULL DEFAULT 12,
    "max_tokens_per_student" INTEGER NOT NULL DEFAULT 1,
    "default_profile_visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolUser" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "SchoolRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentUser" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "phone_index" TEXT,
    "password_hash" TEXT,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ParentUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentDevice" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "device_token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentStudent" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "relationship" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyProfile" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "blood_group" TEXT,
    "allergies" TEXT,
    "conditions" TEXT,
    "medications" TEXT,
    "doctor_name" TEXT,
    "doctor_phone" TEXT,
    "notes" TEXT,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relationship" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentUpdateRequest" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBatch" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "created_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanAnomaly" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationConsent" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "consented_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationEvent" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "token_id" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "source" "LocationSource" NOT NULL DEFAULT 'SCAN_TRIGGER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "parent_user_id" TEXT,
    "school_user_id" TEXT,
    "refresh_token_hash" TEXT NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER,
    "response" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT,
    "parent_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFeatureFlag" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "SchoolFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSettings_school_id_key" ON "SchoolSettings"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolUser_email_key" ON "SchoolUser"("email");

-- CreateIndex
CREATE INDEX "SchoolUser_school_id_idx" ON "SchoolUser"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "ParentUser_email_key" ON "ParentUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ParentUser_phone_index_key" ON "ParentUser"("phone_index");

-- CreateIndex
CREATE INDEX "ParentUser_phone_index_idx" ON "ParentUser"("phone_index");

-- CreateIndex
CREATE INDEX "ParentUser_deleted_at_idx" ON "ParentUser"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ParentDevice_device_token_key" ON "ParentDevice"("device_token");

-- CreateIndex
CREATE INDEX "ParentDevice_parent_id_idx" ON "ParentDevice"("parent_id");

-- CreateIndex
CREATE INDEX "ParentStudent_student_id_idx" ON "ParentStudent"("student_id");

-- CreateIndex
CREATE INDEX "ParentStudent_parent_id_idx" ON "ParentStudent"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "ParentStudent_parent_id_student_id_key" ON "ParentStudent"("parent_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyProfile_student_id_key" ON "EmergencyProfile"("student_id");

-- CreateIndex
CREATE INDEX "EmergencyContact_profile_id_idx" ON "EmergencyContact"("profile_id");

-- CreateIndex
CREATE INDEX "EmergencyContact_profile_id_priority_idx" ON "EmergencyContact"("profile_id", "priority");

-- CreateIndex
CREATE INDEX "StudentUpdateRequest_student_id_idx" ON "StudentUpdateRequest"("student_id");

-- CreateIndex
CREATE INDEX "StudentUpdateRequest_parent_id_idx" ON "StudentUpdateRequest"("parent_id");

-- CreateIndex
CREATE INDEX "StudentUpdateRequest_status_idx" ON "StudentUpdateRequest"("status");

-- CreateIndex
CREATE INDEX "TokenBatch_school_id_idx" ON "TokenBatch"("school_id");

-- CreateIndex
CREATE INDEX "ScanAnomaly_token_id_idx" ON "ScanAnomaly"("token_id");

-- CreateIndex
CREATE INDEX "ScanAnomaly_resolved_idx" ON "ScanAnomaly"("resolved");

-- CreateIndex
CREATE INDEX "ScanAnomaly_created_at_idx" ON "ScanAnomaly"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "LocationConsent_student_id_key" ON "LocationConsent"("student_id");

-- CreateIndex
CREATE INDEX "LocationEvent_student_id_idx" ON "LocationEvent"("student_id");

-- CreateIndex
CREATE INDEX "LocationEvent_student_id_created_at_idx" ON "LocationEvent"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refresh_token_hash_key" ON "Session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "Session_parent_user_id_idx" ON "Session"("parent_user_id");

-- CreateIndex
CREATE INDEX "Session_school_user_id_idx" ON "Session"("school_user_id");

-- CreateIndex
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_hash_key" ON "ApiKey"("key_hash");

-- CreateIndex
CREATE INDEX "ApiKey_school_id_idx" ON "ApiKey"("school_id");

-- CreateIndex
CREATE INDEX "Webhook_school_id_idx" ON "Webhook"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_idempotency_key_key" ON "WebhookDelivery"("idempotency_key");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhook_id_idx" ON "WebhookDelivery"("webhook_id");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhook_id_created_at_idx" ON "WebhookDelivery"("webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "Notification_school_id_idx" ON "Notification"("school_id");

-- CreateIndex
CREATE INDEX "Notification_student_id_idx" ON "Notification"("student_id");

-- CreateIndex
CREATE INDEX "Notification_parent_id_idx" ON "Notification"("parent_id");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "SchoolFeatureFlag_school_id_idx" ON "SchoolFeatureFlag"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeatureFlag_school_id_key_key" ON "SchoolFeatureFlag"("school_id", "key");

-- CreateIndex
CREATE INDEX "AuditLog_actor_id_idx" ON "AuditLog"("actor_id");

-- CreateIndex
CREATE INDEX "AuditLog_school_id_idx" ON "AuditLog"("school_id");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entity_id_idx" ON "AuditLog"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE INDEX "BlacklistToken_expires_at_idx" ON "BlacklistToken"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "Card_card_number_key" ON "Card"("card_number");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_ref_key" ON "Payment"("provider_ref");

-- CreateIndex
CREATE INDEX "Payment_subscription_id_idx" ON "Payment"("subscription_id");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "ScanLog_token_id_created_at_idx" ON "ScanLog"("token_id", "created_at");

-- CreateIndex
CREATE INDEX "ScanLog_result_idx" ON "ScanLog"("result");

-- CreateIndex
CREATE INDEX "ScanLog_result_created_at_idx" ON "ScanLog"("result", "created_at");

-- CreateIndex
CREATE INDEX "ScanRateLimit_window_start_idx" ON "ScanRateLimit"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "School_code_key" ON "School"("code");

-- CreateIndex
CREATE INDEX "School_code_idx" ON "School"("code");

-- CreateIndex
CREATE INDEX "School_is_active_idx" ON "School"("is_active");

-- CreateIndex
CREATE INDEX "Student_school_id_idx" ON "Student"("school_id");

-- CreateIndex
CREATE INDEX "Student_school_id_is_active_idx" ON "Student"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "Student_deleted_at_idx" ON "Student"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_provider_sub_id_key" ON "Subscription"("provider_sub_id");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Token_school_id_status_idx" ON "Token"("school_id", "status");

-- CreateIndex
CREATE INDEX "Token_batch_id_idx" ON "Token"("batch_id");

-- CreateIndex
CREATE INDEX "Token_status_idx" ON "Token"("status");

-- CreateIndex
CREATE INDEX "Token_expires_at_idx" ON "Token"("expires_at");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_event_type_idx" ON "WebhookEvent"("provider", "event_type");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_idx" ON "WebhookEvent"("processed");

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolUser" ADD CONSTRAINT "SchoolUser_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentDevice" ADD CONSTRAINT "ParentDevice_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyProfile" ADD CONSTRAINT "EmergencyProfile_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "EmergencyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentUpdateRequest" ADD CONSTRAINT "StudentUpdateRequest_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentUpdateRequest" ADD CONSTRAINT "StudentUpdateRequest_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "TokenBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenBatch" ADD CONSTRAINT "TokenBatch_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAnomaly" ADD CONSTRAINT "ScanAnomaly_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationConsent" ADD CONSTRAINT "LocationConsent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationEvent" ADD CONSTRAINT "LocationEvent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationEvent" ADD CONSTRAINT "LocationEvent_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_parent_user_id_fkey" FOREIGN KEY ("parent_user_id") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_school_user_id_fkey" FOREIGN KEY ("school_user_id") REFERENCES "SchoolUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT session_one_user_only
CHECK (
  (parent_user_id IS NOT NULL AND school_user_id IS NULL) OR
  (parent_user_id IS NULL AND school_user_id IS NOT NULL)
);