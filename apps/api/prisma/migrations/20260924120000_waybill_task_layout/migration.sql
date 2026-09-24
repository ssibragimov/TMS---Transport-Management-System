-- CreateEnum
CREATE TYPE "WaybillTaskLayout" AS ENUM ('FLIGHT', 'ADDRESS');

-- AlterTable
ALTER TABLE "offices" ADD COLUMN     "task_address_a_locations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "task_layout" "WaybillTaskLayout" NOT NULL DEFAULT 'FLIGHT';

-- AlterTable
ALTER TABLE "waybill_tasks" ALTER COLUMN "aircraft_reg" SET DATA TYPE VARCHAR(160);

-- CreateTable
CREATE TABLE "task_locations" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_locations_office_id_idx" ON "task_locations"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_locations_office_id_code_key" ON "task_locations"("office_id", "code");

-- AddForeignKey
ALTER TABLE "task_locations" ADD CONSTRAINT "task_locations_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
