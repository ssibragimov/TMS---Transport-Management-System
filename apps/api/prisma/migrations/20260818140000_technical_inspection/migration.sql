-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "waybills" ADD COLUMN     "pre_trip_technical_inspection_id" INTEGER,
ADD COLUMN     "technical_override_reason" VARCHAR(400);

-- CreateTable
CREATE TABLE "technical_inspections" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3),
    "result" "CheckResult" NOT NULL DEFAULT 'PASSED',
    "is_pre_trip" BOOLEAN NOT NULL DEFAULT true,
    "checked_by_user_id" INTEGER,
    "mechanic_name" VARCHAR(200),
    "checklist" JSONB,
    "odometer" DECIMAL(12,1),
    "notes" VARCHAR(600),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technical_inspections_vehicle_id_is_pre_trip_checked_at_idx" ON "technical_inspections"("vehicle_id", "is_pre_trip", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "technical_inspections_valid_until_idx" ON "technical_inspections"("valid_until");

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_pre_trip_technical_inspection_id_fkey" FOREIGN KEY ("pre_trip_technical_inspection_id") REFERENCES "technical_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_inspections" ADD CONSTRAINT "technical_inspections_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_inspections" ADD CONSTRAINT "technical_inspections_checked_by_user_id_fkey" FOREIGN KEY ("checked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

