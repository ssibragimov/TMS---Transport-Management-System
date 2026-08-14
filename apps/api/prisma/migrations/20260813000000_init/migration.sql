-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "OfficeKind" AS ENUM ('HEADQUARTERS', 'AIRPORT', 'BRANCH');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('APRON_BUS', 'PUSHBACK_TUG', 'BAGGAGE_TUG', 'BELT_LOADER', 'AMBULIFT', 'DEICER', 'REFUELLER', 'GPU', 'ASU', 'ACU', 'CATERING_TRUCK', 'WATER_TRUCK', 'LAVATORY_TRUCK', 'CARGO_LOADER', 'SNOW_REMOVAL', 'FIRE_TRUCK', 'FOLLOW_ME', 'CAR', 'STAFF_BUS', 'TRUCK', 'FORKLIFT', 'TRAILER', 'STATIONARY_EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('ODOMETER', 'ENGINE_HOURS', 'BOTH', 'NONE');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'REPAIR', 'RESERVE', 'IN_TRANSFER', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('OWNED', 'LEASED', 'RENTED');

-- CreateEnum
CREATE TYPE "VehicleDocumentType" AS ENUM ('REGISTRATION', 'INSURANCE_OSAGO', 'INSURANCE_CASCO', 'TECH_INSPECTION', 'AIRSIDE_VEHICLE_PERMIT', 'CALIBRATION_CERTIFICATE', 'LEASE_CONTRACT', 'TACHOGRAPH', 'OTHER');

-- CreateEnum
CREATE TYPE "MeterSource" AS ENUM ('MANUAL', 'WAYBILL', 'TELEMETRY', 'MOBILE_PHOTO', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LicenseCategory" AS ENUM ('A', 'B', 'C', 'D', 'BE', 'CE', 'DE', 'TRACTOR', 'FORKLIFT');

-- CreateEnum
CREATE TYPE "PermitZone" AS ENUM ('LANDSIDE', 'AIRSIDE', 'APRON', 'MANEUVERING_AREA', 'RUNWAY');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('PASSED', 'FAILED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "FuelSource" AS ENUM ('TANK', 'FUEL_CARD', 'CASH', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "NormType" AS ENUM ('PER_100KM', 'PER_ENGINE_HOUR', 'PER_OPERATION', 'PER_TON_KM', 'PER_SHIFT');

-- CreateEnum
CREATE TYPE "NormAdjustmentKind" AS ENUM ('WINTER', 'AIR_CONDITIONING', 'FREQUENT_STOPS', 'VEHICLE_AGE', 'IDLE_EQUIPMENT', 'RUN_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "WaybillType" AS ENUM ('SHIFT', 'PERIOD');

-- CreateEnum
CREATE TYPE "WaybillStatus" AS ENUM ('DRAFT', 'ISSUED', 'IN_PROGRESS', 'SUBMITTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('DAILY', 'TO_1', 'TO_2', 'SEASONAL', 'CURRENT_REPAIR', 'OVERHAUL', 'TIRE_SERVICE');

-- CreateEnum
CREATE TYPE "MaintenanceTrigger" AS ENUM ('ODOMETER', 'ENGINE_HOURS', 'CALENDAR');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('REQUESTED', 'APPROVED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('DOCUMENT_EXPIRING', 'DOCUMENT_EXPIRED', 'DRIVER_CLEARANCE_EXPIRING', 'FUEL_OVERCONSUMPTION', 'FUEL_TANK_OVERFLOW', 'FUEL_IMPOSSIBLE_SEQUENCE', 'FUEL_DRAIN_SUSPECTED', 'MILEAGE_MISMATCH', 'GEOFENCE_EXIT', 'GEOFENCE_ENTRY', 'SPEEDING', 'MAINTENANCE_DUE', 'TANK_LOW_LEVEL', 'INVENTORY_DISCREPANCY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'EXPORT', 'PRINT', 'APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "offices" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "kind" "OfficeKind" NOT NULL DEFAULT 'AIRPORT',
    "parent_id" INTEGER,
    "name_ru" VARCHAR(160) NOT NULL,
    "name_uz" VARCHAR(160) NOT NULL,
    "name_en" VARCHAR(160) NOT NULL,
    "iata_code" VARCHAR(3),
    "icao_code" VARCHAR(4),
    "city" VARCHAR(120),
    "address" VARCHAR(400),
    "phone" VARCHAR(40),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tashkent',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "winter_surcharge_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "winter_from_month" SMALLINT NOT NULL DEFAULT 11,
    "winter_to_month" SMALLINT NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(190) NOT NULL,
    "password_hash" VARCHAR(120) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(40),
    "locale" VARCHAR(8) NOT NULL DEFAULT 'ru',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "default_office_id" INTEGER,
    "bypass_rls" BOOLEAN NOT NULL DEFAULT false,
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "last_login_at" TIMESTAMPTZ(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_offices" (
    "user_id" INTEGER NOT NULL,
    "office_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_offices_pkey" PRIMARY KEY ("user_id","office_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(48) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "group_code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(300),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "office_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "office_id" INTEGER NOT NULL,
    "user_agent" VARCHAR(400),
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_types" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "density" DECIMAL(6,4) NOT NULL DEFAULT 0.75,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" SERIAL NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "manufacturer" VARCHAR(120) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "fuel_type_id" INTEGER,
    "meter_type" "MeterType" NOT NULL DEFAULT 'ODOMETER',
    "tank_capacity" DECIMAL(10,2),
    "gross_weight" INTEGER,
    "seats" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "model_id" INTEGER NOT NULL,
    "garage_number" VARCHAR(24) NOT NULL,
    "plate_number" VARCHAR(24),
    "vin" VARCHAR(24),
    "inventory_number" VARCHAR(32),
    "category" "VehicleCategory" NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownership" "OwnershipType" NOT NULL DEFAULT 'OWNED',
    "fuel_type_id" INTEGER,
    "meter_type" "MeterType" NOT NULL DEFAULT 'ODOMETER',
    "tank_capacity" DECIMAL(10,2),
    "current_odometer" DECIMAL(12,1),
    "current_engine_hours" DECIMAL(12,1),
    "current_fuel_level" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "manufacture_year" SMALLINT,
    "commissioned_at" DATE,
    "decommissioned_at" DATE,
    "requires_airside_permit" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_assignments" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "office_id" INTEGER NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_documents" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "type" "VehicleDocumentType" NOT NULL,
    "number" VARCHAR(64),
    "issuer" VARCHAR(200),
    "issued_at" DATE,
    "expires_at" DATE,
    "file_key" VARCHAR(400),
    "amount" DECIMAL(14,2),
    "notes" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_meter_readings" (
    "id" BIGSERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "odometer" DECIMAL(12,1),
    "engine_hours" DECIMAL(12,1),
    "source" "MeterSource" NOT NULL DEFAULT 'MANUAL',
    "waybill_id" INTEGER,
    "photo_key" VARCHAR(400),
    "comment" VARCHAR(300),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "user_id" INTEGER,
    "personnel_number" VARCHAR(24) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "middle_name" VARCHAR(80),
    "birth_date" DATE,
    "phone" VARCHAR(40),
    "hire_date" DATE,
    "dismiss_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "photo_key" VARCHAR(400),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_licenses" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "categories" "LicenseCategory"[],
    "issued_at" DATE NOT NULL,
    "expires_at" DATE NOT NULL,
    "file_key" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "driver_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_permits" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "zone" "PermitZone" NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "issued_at" DATE NOT NULL,
    "expires_at" DATE NOT NULL,
    "file_key" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "driver_permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_checks" (
    "id" SERIAL NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" DATE,
    "result" "CheckResult" NOT NULL DEFAULT 'PASSED',
    "is_pre_trip" BOOLEAN NOT NULL DEFAULT false,
    "doctor_name" VARCHAR(200),
    "blood_pressure" VARCHAR(16),
    "temperature" DECIMAL(4,1),
    "alcohol_ppm" DECIMAL(5,3),
    "notes" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparties" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "inn" VARCHAR(20),
    "is_fuel_supplier" BOOLEAN NOT NULL DEFAULT false,
    "is_service_provider" BOOLEAN NOT NULL DEFAULT false,
    "contact_phone" VARCHAR(40),
    "address" VARCHAR(400),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_tanks" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "fuel_type_id" INTEGER NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "capacity" DECIMAL(12,2) NOT NULL,
    "current_volume" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_volume" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "location" VARCHAR(240),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fuel_tanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_receipts" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "tank_id" INTEGER NOT NULL,
    "fuel_type_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "document_number" VARCHAR(40) NOT NULL,
    "external_number" VARCHAR(64),
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "volume" DECIMAL(12,2) NOT NULL,
    "density" DECIMAL(6,4),
    "price_per_litre" DECIMAL(14,4),
    "total_amount" DECIMAL(16,2),
    "file_key" VARCHAR(400),
    "notes" VARCHAR(400),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fuel_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_cards" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "provider_name" VARCHAR(120),
    "provider_id" INTEGER,
    "vehicle_id" INTEGER,
    "monthly_limit" DECIMAL(12,2),
    "expires_at" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fuel_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_issues" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "driver_id" INTEGER,
    "waybill_id" INTEGER,
    "fuel_type_id" INTEGER NOT NULL,
    "source" "FuelSource" NOT NULL DEFAULT 'TANK',
    "tank_id" INTEGER,
    "fuel_card_id" INTEGER,
    "document_number" VARCHAR(40) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "volume" DECIMAL(10,2) NOT NULL,
    "price_per_litre" DECIMAL(14,4),
    "total_amount" DECIMAL(16,2),
    "odometer_at_issue" DECIMAL(12,1),
    "engine_hours_at_issue" DECIMAL(12,1),
    "location_name" VARCHAR(240),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "operator_id" INTEGER,
    "receipt_key" VARCHAR(400),
    "notes" VARCHAR(400),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fuel_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_norms" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER,
    "model_id" INTEGER,
    "fuel_type_id" INTEGER,
    "norm_type" "NormType" NOT NULL,
    "base_rate" DECIMAL(10,3) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "document_ref" VARCHAR(200),
    "notes" VARCHAR(400),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fuel_norms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_norm_adjustments" (
    "id" SERIAL NOT NULL,
    "norm_id" INTEGER NOT NULL,
    "kind" "NormAdjustmentKind" NOT NULL,
    "percent" DECIMAL(6,2),
    "absolute_per_unit" DECIMAL(10,3),
    "applies_to" "NormType",
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "season_from_month" SMALLINT,
    "season_to_month" SMALLINT,
    "document_ref" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fuel_norm_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_inventories" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "tank_id" INTEGER NOT NULL,
    "document_number" VARCHAR(40) NOT NULL,
    "counted_at" TIMESTAMPTZ(3) NOT NULL,
    "book_volume" DECIMAL(12,2) NOT NULL,
    "actual_volume" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "temperature" DECIMAL(4,1),
    "density" DECIMAL(6,4),
    "is_adjusted" BOOLEAN NOT NULL DEFAULT false,
    "commission" VARCHAR(500),
    "file_key" VARCHAR(400),
    "notes" VARCHAR(400),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "fuel_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybills" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "type" "WaybillType" NOT NULL DEFAULT 'SHIFT',
    "status" "WaybillStatus" NOT NULL DEFAULT 'DRAFT',
    "vehicle_id" INTEGER NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "co_driver_id" INTEGER,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3) NOT NULL,
    "odometer_start" DECIMAL(12,1),
    "engine_hours_start" DECIMAL(12,1),
    "odometer_end" DECIMAL(12,1),
    "engine_hours_end" DECIMAL(12,1),
    "distance_km" DECIMAL(12,1),
    "engine_hours" DECIMAL(12,1),
    "operations" INTEGER,
    "ton_km" DECIMAL(14,2),
    "fuel_opening" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fuel_issued" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fuel_consumed" DECIMAL(10,2),
    "fuel_closing" DECIMAL(10,2),
    "fuel_norm" DECIMAL(10,2),
    "fuel_deviation" DECIMAL(10,2),
    "fuel_deviation_pct" DECIMAL(8,2),
    "norm_breakdown" JSONB,
    "pre_trip_medical_ok" BOOLEAN,
    "pre_trip_technical_ok" BOOLEAN,
    "pre_trip_checked_at" TIMESTAMPTZ(3),
    "pre_trip_checked_by" INTEGER,
    "pre_trip_checklist" JSONB,
    "issued_by" INTEGER,
    "issued_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "closed_by" INTEGER,
    "closed_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(400),
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "waybills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybill_tasks" (
    "id" SERIAL NOT NULL,
    "waybill_id" INTEGER NOT NULL,
    "sequence" SMALLINT NOT NULL,
    "from_point" VARCHAR(240),
    "to_point" VARCHAR(240),
    "flight_number" VARCHAR(16),
    "aircraft_reg" VARCHAR(16),
    "stand_number" VARCHAR(16),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "distance_km" DECIMAL(10,1),
    "engine_hours" DECIMAL(8,2),
    "cargo_tons" DECIMAL(10,3),
    "passengers" INTEGER,
    "operations" INTEGER,
    "notes" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waybill_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "trigger" "MaintenanceTrigger" NOT NULL,
    "interval_value" INTEGER NOT NULL,
    "warn_before" INTEGER NOT NULL DEFAULT 500,
    "last_odometer" DECIMAL(12,1),
    "last_engine_hours" DECIMAL(12,1),
    "last_performed_at" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "contractor_id" INTEGER,
    "description" TEXT NOT NULL,
    "odometer_at" DECIMAL(12,1),
    "engine_hours_at" DECIMAL(12,1),
    "planned_start" DATE,
    "actual_start" TIMESTAMPTZ(3),
    "actual_end" TIMESTAMPTZ(3),
    "downtime_hours" DECIMAL(8,2),
    "labor_cost" DECIMAL(16,2),
    "parts_cost" DECIMAL(16,2),
    "total_cost" DECIMAL(16,2),
    "requested_by" INTEGER,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(48) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "unit" VARCHAR(16) NOT NULL DEFAULT 'шт',
    "catalog_number" VARCHAR(64),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_part_stocks" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "min_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "avg_price" DECIMAL(16,2),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spare_part_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_parts" (
    "id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(16,2),
    "total_price" DECIMAL(16,2),

    CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_installations" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "serial_number" VARCHAR(48) NOT NULL,
    "brand" VARCHAR(120),
    "size" VARCHAR(32),
    "position" VARCHAR(8) NOT NULL,
    "installed_at" DATE NOT NULL,
    "installed_odometer" DECIMAL(12,1),
    "removed_at" DATE,
    "removed_odometer" DECIMAL(12,1),
    "remove_reason" VARCHAR(240),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tire_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_devices" (
    "id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "imei" VARCHAR(24) NOT NULL,
    "provider" VARCHAR(80),
    "model" VARCHAR(80),
    "sim_number" VARCHAR(24),
    "has_fuel_sensor" BOOLEAN NOT NULL DEFAULT false,
    "installed_at" DATE NOT NULL,
    "removed_at" DATE,
    "last_seen_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gps_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_positions" (
    "id" BIGSERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "device_id" INTEGER,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "altitude" INTEGER,
    "speed" DECIMAL(6,2),
    "heading" SMALLINT,
    "satellites" SMALLINT,
    "ignition" BOOLEAN,
    "fuel_level" DECIMAL(10,2),
    "engine_hours" DECIMAL(12,1),
    "odometer" DECIMAL(12,1),
    "raw" JSONB,

    CONSTRAINT "telemetry_positions_pkey" PRIMARY KEY ("ts","id")
);

-- CreateTable
CREATE TABLE "geofences" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "speed_limit" INTEGER,
    "alert_on_entry" BOOLEAN NOT NULL DEFAULT false,
    "alert_on_exit" BOOLEAN NOT NULL DEFAULT false,
    "color" VARCHAR(9),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "vehicle_id" INTEGER,
    "driver_id" INTEGER,
    "entity_type" VARCHAR(48),
    "entity_id" INTEGER,
    "title" VARCHAR(240) NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "acknowledged_by" INTEGER,
    "acknowledged_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "dedupe_key" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "office_id" INTEGER,
    "user_id" INTEGER,
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "ip_address" INET,
    "user_agent" VARCHAR(400),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offices_code_key" ON "offices"("code");

-- CreateIndex
CREATE INDEX "offices_parent_id_idx" ON "offices"("parent_id");

-- CreateIndex
CREATE INDEX "offices_is_active_idx" ON "offices"("is_active");

-- CreateIndex
CREATE INDEX "departments_office_id_idx" ON "departments"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_office_id_code_key" ON "departments"("office_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_default_office_id_idx" ON "users"("default_office_id");

-- CreateIndex
CREATE INDEX "user_offices_office_id_idx" ON "user_offices"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_group_code_idx" ON "permissions"("group_code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_office_id_idx" ON "user_roles"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_office_id_key" ON "user_roles"("user_id", "role_id", "office_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_types_code_key" ON "fuel_types"("code");

-- CreateIndex
CREATE INDEX "vehicle_models_category_idx" ON "vehicle_models"("category");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_manufacturer_model_key" ON "vehicle_models"("manufacturer", "model");

-- CreateIndex
CREATE INDEX "vehicles_office_id_status_idx" ON "vehicles"("office_id", "status");

-- CreateIndex
CREATE INDEX "vehicles_office_id_category_idx" ON "vehicles"("office_id", "category");

-- CreateIndex
CREATE INDEX "vehicles_plate_number_idx" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "vehicles_model_id_idx" ON "vehicles"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_office_id_garage_number_key" ON "vehicles"("office_id", "garage_number");

-- CreateIndex
CREATE INDEX "vehicle_assignments_vehicle_id_from_date_idx" ON "vehicle_assignments"("vehicle_id", "from_date");

-- CreateIndex
CREATE INDEX "vehicle_assignments_office_id_idx" ON "vehicle_assignments"("office_id");

-- CreateIndex
CREATE INDEX "vehicle_documents_vehicle_id_type_idx" ON "vehicle_documents"("vehicle_id", "type");

-- CreateIndex
CREATE INDEX "vehicle_documents_expires_at_idx" ON "vehicle_documents"("expires_at");

-- CreateIndex
CREATE INDEX "vehicle_meter_readings_vehicle_id_recorded_at_idx" ON "vehicle_meter_readings"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE INDEX "drivers_office_id_is_active_idx" ON "drivers"("office_id", "is_active");

-- CreateIndex
CREATE INDEX "drivers_last_name_idx" ON "drivers"("last_name");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_office_id_personnel_number_key" ON "drivers"("office_id", "personnel_number");

-- CreateIndex
CREATE INDEX "driver_licenses_driver_id_idx" ON "driver_licenses"("driver_id");

-- CreateIndex
CREATE INDEX "driver_licenses_expires_at_idx" ON "driver_licenses"("expires_at");

-- CreateIndex
CREATE INDEX "driver_permits_driver_id_zone_idx" ON "driver_permits"("driver_id", "zone");

-- CreateIndex
CREATE INDEX "driver_permits_expires_at_idx" ON "driver_permits"("expires_at");

-- CreateIndex
CREATE INDEX "medical_checks_driver_id_checked_at_idx" ON "medical_checks"("driver_id", "checked_at");

-- CreateIndex
CREATE INDEX "medical_checks_valid_until_idx" ON "medical_checks"("valid_until");

-- CreateIndex
CREATE INDEX "counterparties_office_id_idx" ON "counterparties"("office_id");

-- CreateIndex
CREATE INDEX "fuel_tanks_office_id_idx" ON "fuel_tanks"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_tanks_office_id_code_key" ON "fuel_tanks"("office_id", "code");

-- CreateIndex
CREATE INDEX "fuel_receipts_office_id_received_at_idx" ON "fuel_receipts"("office_id", "received_at");

-- CreateIndex
CREATE INDEX "fuel_receipts_tank_id_received_at_idx" ON "fuel_receipts"("tank_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_receipts_office_id_document_number_key" ON "fuel_receipts"("office_id", "document_number");

-- CreateIndex
CREATE INDEX "fuel_cards_office_id_idx" ON "fuel_cards"("office_id");

-- CreateIndex
CREATE INDEX "fuel_cards_vehicle_id_idx" ON "fuel_cards"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_cards_office_id_number_key" ON "fuel_cards"("office_id", "number");

-- CreateIndex
CREATE INDEX "fuel_issues_office_id_issued_at_idx" ON "fuel_issues"("office_id", "issued_at");

-- CreateIndex
CREATE INDEX "fuel_issues_vehicle_id_issued_at_idx" ON "fuel_issues"("vehicle_id", "issued_at");

-- CreateIndex
CREATE INDEX "fuel_issues_waybill_id_idx" ON "fuel_issues"("waybill_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_issues_office_id_document_number_key" ON "fuel_issues"("office_id", "document_number");

-- CreateIndex
CREATE INDEX "fuel_norms_office_id_vehicle_id_valid_from_idx" ON "fuel_norms"("office_id", "vehicle_id", "valid_from");

-- CreateIndex
CREATE INDEX "fuel_norms_office_id_model_id_valid_from_idx" ON "fuel_norms"("office_id", "model_id", "valid_from");

-- CreateIndex
CREATE INDEX "fuel_norm_adjustments_norm_id_idx" ON "fuel_norm_adjustments"("norm_id");

-- CreateIndex
CREATE INDEX "fuel_inventories_tank_id_counted_at_idx" ON "fuel_inventories"("tank_id", "counted_at");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_inventories_office_id_document_number_key" ON "fuel_inventories"("office_id", "document_number");

-- CreateIndex
CREATE INDEX "waybills_office_id_status_valid_from_idx" ON "waybills"("office_id", "status", "valid_from");

-- CreateIndex
CREATE INDEX "waybills_vehicle_id_valid_from_idx" ON "waybills"("vehicle_id", "valid_from");

-- CreateIndex
CREATE INDEX "waybills_driver_id_valid_from_idx" ON "waybills"("driver_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "waybills_office_id_number_key" ON "waybills"("office_id", "number");

-- CreateIndex
CREATE INDEX "waybill_tasks_flight_number_idx" ON "waybill_tasks"("flight_number");

-- CreateIndex
CREATE UNIQUE INDEX "waybill_tasks_waybill_id_sequence_key" ON "waybill_tasks"("waybill_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_office_id_kind_year_key" ON "document_sequences"("office_id", "kind", "year");

-- CreateIndex
CREATE INDEX "maintenance_plans_vehicle_id_idx" ON "maintenance_plans"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_plans_vehicle_id_kind_key" ON "maintenance_plans"("vehicle_id", "kind");

-- CreateIndex
CREATE INDEX "work_orders_office_id_status_idx" ON "work_orders"("office_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_vehicle_id_idx" ON "work_orders"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_office_id_number_key" ON "work_orders"("office_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_code_key" ON "spare_parts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "spare_part_stocks_office_id_part_id_key" ON "spare_part_stocks"("office_id", "part_id");

-- CreateIndex
CREATE INDEX "work_order_parts_work_order_id_idx" ON "work_order_parts"("work_order_id");

-- CreateIndex
CREATE INDEX "tire_installations_vehicle_id_removed_at_idx" ON "tire_installations"("vehicle_id", "removed_at");

-- CreateIndex
CREATE INDEX "tire_installations_serial_number_idx" ON "tire_installations"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "gps_devices_imei_key" ON "gps_devices"("imei");

-- CreateIndex
CREATE INDEX "gps_devices_vehicle_id_idx" ON "gps_devices"("vehicle_id");

-- CreateIndex
CREATE INDEX "telemetry_positions_vehicle_id_ts_idx" ON "telemetry_positions"("vehicle_id", "ts" DESC);

-- CreateIndex
CREATE INDEX "geofences_office_id_idx" ON "geofences"("office_id");

-- CreateIndex
CREATE INDEX "alerts_office_id_type_occurred_at_idx" ON "alerts"("office_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "alerts_office_id_acknowledged_at_idx" ON "alerts"("office_id", "acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupe_key_key" ON "alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "audit_logs_office_id_created_at_idx" ON "audit_logs"("office_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_office_id_fkey" FOREIGN KEY ("default_office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_offices" ADD CONSTRAINT "user_offices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_offices" ADD CONSTRAINT "user_offices_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_meter_readings" ADD CONSTRAINT "vehicle_meter_readings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_meter_readings" ADD CONSTRAINT "vehicle_meter_readings_waybill_id_fkey" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_licenses" ADD CONSTRAINT "driver_licenses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_permits" ADD CONSTRAINT "driver_permits_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_checks" ADD CONSTRAINT "medical_checks_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_receipts" ADD CONSTRAINT "fuel_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_cards" ADD CONSTRAINT "fuel_cards_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_cards" ADD CONSTRAINT "fuel_cards_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_cards" ADD CONSTRAINT "fuel_cards_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_waybill_id_fkey" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_issues" ADD CONSTRAINT "fuel_issues_fuel_card_id_fkey" FOREIGN KEY ("fuel_card_id") REFERENCES "fuel_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_norms" ADD CONSTRAINT "fuel_norms_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_norms" ADD CONSTRAINT "fuel_norms_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_norms" ADD CONSTRAINT "fuel_norms_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_norms" ADD CONSTRAINT "fuel_norms_fuel_type_id_fkey" FOREIGN KEY ("fuel_type_id") REFERENCES "fuel_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_norm_adjustments" ADD CONSTRAINT "fuel_norm_adjustments_norm_id_fkey" FOREIGN KEY ("norm_id") REFERENCES "fuel_norms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_inventories" ADD CONSTRAINT "fuel_inventories_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_inventories" ADD CONSTRAINT "fuel_inventories_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybill_tasks" ADD CONSTRAINT "waybill_tasks_waybill_id_fkey" FOREIGN KEY ("waybill_id") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_stocks" ADD CONSTRAINT "spare_part_stocks_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spare_part_stocks" ADD CONSTRAINT "spare_part_stocks_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "spare_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_installations" ADD CONSTRAINT "tire_installations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_devices" ADD CONSTRAINT "gps_devices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
