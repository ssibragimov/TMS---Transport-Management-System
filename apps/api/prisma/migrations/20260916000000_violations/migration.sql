-- CreateTable
CREATE TABLE "violation_types" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "default_fine_amount" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "violation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER,
    "type_id" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "fine_amount" DECIMAL(12,2),
    "description" VARCHAR(400),
    "photo_key" VARCHAR(400),
    "issued_by_user_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "violation_types_office_id_idx" ON "violation_types"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "violation_types_office_id_code_key" ON "violation_types"("office_id", "code");

-- CreateIndex
CREATE INDEX "violations_driver_id_occurred_at_idx" ON "violations"("driver_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "violations_vehicle_id_idx" ON "violations"("vehicle_id");

-- CreateIndex
CREATE INDEX "violations_type_id_idx" ON "violations"("type_id");

-- AddForeignKey
ALTER TABLE "violation_types" ADD CONSTRAINT "violation_types_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "violation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
