/*
  Warnings:

  - The values [SUPER_ADMIN] on the enum `SchoolRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `revoked_at` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the `Admin` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'SUPER_ADMIN';

-- AlterEnum
BEGIN;
CREATE TYPE "SchoolRole_new" AS ENUM ('ADMIN', 'STAFF', 'VIEWER');
ALTER TABLE "SchoolUser" ALTER COLUMN "role" TYPE "SchoolRole_new" USING ("role"::text::"SchoolRole_new");
ALTER TYPE "SchoolRole" RENAME TO "SchoolRole_old";
ALTER TYPE "SchoolRole_new" RENAME TO "SchoolRole";
DROP TYPE "public"."SchoolRole_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "fk_session_admin";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "fk_session_parent";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "fk_session_school";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "revoked_at";

-- DropTable
DROP TABLE "Admin";

-- DropEnum
DROP TYPE "AdminRole";

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

-- CreateIndex
CREATE INDEX "SuperAdmin_email_idx" ON "SuperAdmin"("email");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "SuperAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_session_admin" RENAME TO "Session_admin_user_id_idx";
