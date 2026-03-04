/*
  Warnings:

  - The `print_status` column on the `Card` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `phone` on the `EmergencyContact` table. All the data in the column will be lost.
  - You are about to drop the column `doctor_phone` on the `EmergencyProfile` table. All the data in the column will be lost.
  - The primary key for the `ScanRateLimit` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `device_hash` on the `ScanRateLimit` table. All the data in the column will be lost.
  - You are about to drop the column `ip_address` on the `ScanRateLimit` table. All the data in the column will be lost.
  - You are about to drop the `StudentUpdateRequest` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[identifier,identifier_type]` on the table `ScanRateLimit` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `phone_encrypted` to the `EmergencyContact` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `platform` on the `ParentDevice` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - The required column `id` was added to the `ScanRateLimit` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `identifier` to the `ScanRateLimit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `identifier_type` to the `ScanRateLimit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ParentEditType" AS ENUM ('EMERGENCY_CONTACTS', 'EMERGENCY_PROFILE', 'STUDENT_NAME', 'STUDENT_PHOTO', 'PARENT_PHONE', 'PARENT_EMAIL', 'CARD_VISIBILITY');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'PHONE_VERIFY', 'CARD_BLOCK', 'EMAIL_VERIFY');

-- CreateEnum
CREATE TYPE "RateLimitIdentifierType" AS ENUM ('IP', 'DEVICE');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('PENDING', 'PRINTED', 'REPRINTED', 'FAILED');

-- DropForeignKey
ALTER TABLE "StudentUpdateRequest" DROP CONSTRAINT "StudentUpdateRequest_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "StudentUpdateRequest" DROP CONSTRAINT "StudentUpdateRequest_student_id_fkey";

-- DropIndex
DROP INDEX "ScanRateLimit_device_hash_idx";

-- AlterTable
ALTER TABLE "Card" DROP COLUMN "print_status",
ADD COLUMN     "print_status" "PrintStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "EmergencyContact" DROP COLUMN "phone",
ADD COLUMN     "phone_encrypted" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EmergencyProfile" DROP COLUMN "doctor_phone",
ADD COLUMN     "doctor_phone_encrypted" TEXT;

-- AlterTable
ALTER TABLE "ParentDevice" ADD COLUMN     "app_version" TEXT,
ADD COLUMN     "device_name" TEXT,
ADD COLUMN     "last_seen_at" TIMESTAMP(3),
DROP COLUMN "platform",
ADD COLUMN     "platform" "DevicePlatform" NOT NULL;

-- AlterTable
ALTER TABLE "ScanRateLimit" DROP CONSTRAINT "ScanRateLimit_pkey",
DROP COLUMN "device_hash",
DROP COLUMN "ip_address",
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "identifier" TEXT NOT NULL,
ADD COLUMN     "identifier_type" "RateLimitIdentifierType" NOT NULL,
ADD CONSTRAINT "ScanRateLimit_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "last_active_at" TIMESTAMP(3),
ADD COLUMN     "user_agent" TEXT;

-- DropTable
DROP TABLE "StudentUpdateRequest";

-- DropEnum
DROP TYPE "RequestStatus";

-- CreateTable
CREATE TABLE "OtpLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invalidated" BOOLEAN NOT NULL DEFAULT false,
    "msg91_req_id" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentEditLog" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "field_group" "ParentEditType" NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardVisibility" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "hidden_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_by_parent" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpLog_phone_purpose_idx" ON "OtpLog"("phone", "purpose");

-- CreateIndex
CREATE INDEX "OtpLog_expires_at_idx" ON "OtpLog"("expires_at");

-- CreateIndex
CREATE INDEX "OtpLog_msg91_req_id_idx" ON "OtpLog"("msg91_req_id");

-- CreateIndex
CREATE INDEX "ParentEditLog_student_id_idx" ON "ParentEditLog"("student_id");

-- CreateIndex
CREATE INDEX "ParentEditLog_parent_id_idx" ON "ParentEditLog"("parent_id");

-- CreateIndex
CREATE INDEX "ParentEditLog_school_id_idx" ON "ParentEditLog"("school_id");

-- CreateIndex
CREATE INDEX "ParentEditLog_created_at_idx" ON "ParentEditLog"("created_at");

-- CreateIndex
CREATE INDEX "ParentEditLog_field_group_idx" ON "ParentEditLog"("field_group");

-- CreateIndex
CREATE UNIQUE INDEX "CardVisibility_student_id_key" ON "CardVisibility"("student_id");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "LocationEvent_token_id_idx" ON "LocationEvent"("token_id");

-- CreateIndex
CREATE INDEX "ScanRateLimit_identifier_identifier_type_idx" ON "ScanRateLimit"("identifier", "identifier_type");

-- CreateIndex
CREATE INDEX "ScanRateLimit_blocked_until_idx" ON "ScanRateLimit"("blocked_until");

-- CreateIndex
CREATE UNIQUE INDEX "ScanRateLimit_identifier_identifier_type_key" ON "ScanRateLimit"("identifier", "identifier_type");

-- CreateIndex
CREATE INDEX "Session_last_active_at_idx" ON "Session"("last_active_at");

-- AddForeignKey
ALTER TABLE "ParentEditLog" ADD CONSTRAINT "ParentEditLog_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentEditLog" ADD CONSTRAINT "ParentEditLog_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentEditLog" ADD CONSTRAINT "ParentEditLog_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardVisibility" ADD CONSTRAINT "CardVisibility_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
