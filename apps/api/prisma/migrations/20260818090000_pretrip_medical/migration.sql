-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "medical_checks" ADD COLUMN     "checked_by_user_id" INTEGER,
ALTER COLUMN "valid_until" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "waybills" ADD COLUMN     "medical_override_reason" VARCHAR(400),
ADD COLUMN     "pre_trip_medical_check_id" INTEGER;

-- CreateIndex
CREATE INDEX "medical_checks_driver_id_is_pre_trip_checked_at_idx" ON "medical_checks"("driver_id", "is_pre_trip", "checked_at" DESC);

-- AddForeignKey
ALTER TABLE "medical_checks" ADD CONSTRAINT "medical_checks_checked_by_user_id_fkey" FOREIGN KEY ("checked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_pre_trip_medical_check_id_fkey" FOREIGN KEY ("pre_trip_medical_check_id") REFERENCES "medical_checks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

