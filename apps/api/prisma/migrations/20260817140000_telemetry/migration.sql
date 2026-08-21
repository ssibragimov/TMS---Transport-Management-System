-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "geofences" ADD COLUMN     "area" JSONB;

-- CreateTable
CREATE TABLE "telemetry_last_positions" (
    "vehicle_id" INTEGER NOT NULL,
    "device_id" INTEGER,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speed" DECIMAL(6,2),
    "heading" SMALLINT,
    "ignition" BOOLEAN,
    "odometer" DECIMAL(12,1),
    "engine_hours" DECIMAL(12,1),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telemetry_last_positions_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "geofence_events" (
    "id" BIGSERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "geofence_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speed" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geofence_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "geofence_events_office_id_occurred_at_idx" ON "geofence_events"("office_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "geofence_events_vehicle_id_occurred_at_idx" ON "geofence_events"("vehicle_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "telemetry_last_positions" ADD CONSTRAINT "telemetry_last_positions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofence_id_fkey" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

