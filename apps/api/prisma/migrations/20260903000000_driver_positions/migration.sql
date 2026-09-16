-- CreateTable
CREATE TABLE "driver_positions" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "driver_positions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "position_id" INTEGER;

-- CreateIndex
CREATE INDEX "driver_positions_department_id_idx" ON "driver_positions"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_positions_department_id_code_key" ON "driver_positions"("department_id", "code");

-- AddForeignKey
ALTER TABLE "driver_positions" ADD CONSTRAINT "driver_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "driver_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
