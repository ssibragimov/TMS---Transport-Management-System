-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "VehicleCondition" AS ENUM ('SERVICEABLE', 'MINOR_DEFECTS', 'UNSERVICEABLE', 'DAMAGED', 'ACCIDENT');

-- AlterTable
ALTER TABLE "waybills" ADD COLUMN     "condition_issue_notes" VARCHAR(600),
ADD COLUMN     "condition_on_issue" "VehicleCondition",
ADD COLUMN     "condition_on_return" "VehicleCondition",
ADD COLUMN     "condition_return_notes" VARCHAR(600);

-- CreateTable
CREATE TABLE "vehicle_condition_acts" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "waybill_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "condition_on_issue" "VehicleCondition" NOT NULL,
    "condition_on_return" "VehicleCondition" NOT NULL,
    "description" TEXT NOT NULL,
    "medical_check_id" INTEGER,
    "reported_by" INTEGER,
    "reported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_condition_acts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_condition_acts_office_id_reported_at_idx" ON "vehicle_condition_acts"("office_id", "reported_at" DESC);

-- CreateIndex
CREATE INDEX "vehicle_condition_acts_vehicle_id_idx" ON "vehicle_condition_acts"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_condition_acts_driver_id_idx" ON "vehicle_condition_acts"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_condition_acts_office_id_number_key" ON "vehicle_condition_acts"("office_id", "number");

-- AddForeignKey
ALTER TABLE "vehicle_condition_acts" ADD CONSTRAINT "vehicle_condition_acts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_condition_acts" ADD CONSTRAINT "vehicle_condition_acts_waybill_id_fkey" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_condition_acts" ADD CONSTRAINT "vehicle_condition_acts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_condition_acts" ADD CONSTRAINT "vehicle_condition_acts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

