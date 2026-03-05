-- DropIndex
DROP INDEX "RegistrationNonce_nonce_idx";

-- AlterTable
ALTER TABLE "RegistrationNonce" ADD COLUMN     "phone_index" TEXT;

-- CreateIndex
CREATE INDEX "RegistrationNonce_token_id_idx" ON "RegistrationNonce"("token_id");
