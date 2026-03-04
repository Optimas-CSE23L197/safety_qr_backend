-- AlterTable
ALTER TABLE "Card" ALTER COLUMN "student_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ScanLog" ADD COLUMN     "device_hash" TEXT,
ADD COLUMN     "ip_region" TEXT,
ADD COLUMN     "scan_purpose" TEXT;

-- AlterTable
ALTER TABLE "ScanRateLimit" ADD COLUMN     "blocked_until" TIMESTAMP(3),
ADD COLUMN     "device_hash" TEXT;

-- AlterTable
ALTER TABLE "School" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Kolkata';

-- CreateTable
CREATE TABLE "CardTemplate" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "logo_url" TEXT,
    "background_color" TEXT NOT NULL DEFAULT '#FFFFFF',
    "primary_color" TEXT NOT NULL DEFAULT '#000000',
    "text_color" TEXT NOT NULL DEFAULT '#000000',
    "qr_dark_color" TEXT NOT NULL DEFAULT '#000000',
    "qr_light_color" TEXT NOT NULL DEFAULT '#FFFFFF',
    "cover_accent_color" TEXT NOT NULL DEFAULT '#E8342A',
    "cover_tagline" TEXT,
    "cards_per_sheet" INTEGER NOT NULL DEFAULT 8,
    "show_student_name" BOOLEAN NOT NULL DEFAULT true,
    "show_class" BOOLEAN NOT NULL DEFAULT true,
    "show_school_name" BOOLEAN NOT NULL DEFAULT true,
    "show_photo" BOOLEAN NOT NULL DEFAULT true,
    "card_width" INTEGER NOT NULL DEFAULT 640,
    "card_height" INTEGER NOT NULL DEFAULT 400,
    "is_locked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedScanZone" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ip_range" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius_m" INTEGER NOT NULL DEFAULT 200,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedScanZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardTemplate_school_id_key" ON "CardTemplate"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationNonce_nonce_key" ON "RegistrationNonce"("nonce");

-- CreateIndex
CREATE INDEX "RegistrationNonce_nonce_idx" ON "RegistrationNonce"("nonce");

-- CreateIndex
CREATE INDEX "RegistrationNonce_expires_at_idx" ON "RegistrationNonce"("expires_at");

-- CreateIndex
CREATE INDEX "TrustedScanZone_school_id_idx" ON "TrustedScanZone"("school_id");

-- CreateIndex
CREATE INDEX "TrustedScanZone_school_id_is_active_idx" ON "TrustedScanZone"("school_id", "is_active");

-- CreateIndex
CREATE INDEX "Card_token_id_idx" ON "Card"("token_id");

-- CreateIndex
CREATE INDEX "ScanLog_device_hash_idx" ON "ScanLog"("device_hash");

-- CreateIndex
CREATE INDEX "ScanRateLimit_device_hash_idx" ON "ScanRateLimit"("device_hash");

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationNonce" ADD CONSTRAINT "RegistrationNonce_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedScanZone" ADD CONSTRAINT "TrustedScanZone_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
