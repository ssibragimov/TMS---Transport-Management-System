-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "StockCategory" AS ENUM ('OIL', 'FILTER', 'TIRE', 'BATTERY', 'BRAKE', 'ELECTRIC', 'FLUID', 'SPARE', 'HARDWARE', 'TOOL', 'PPE', 'OTHER');

-- CreateEnum
CREATE TYPE "StockTracking" AS ENUM ('QUANTITY', 'SERIAL', 'BATCH');

-- CreateEnum
CREATE TYPE "WarehouseKind" AS ENUM ('MAIN', 'SUB', 'UTILIZATION');

-- CreateEnum
CREATE TYPE "StockDocumentKind" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'WRITE_OFF', 'TRANSFER');

-- CreateEnum
CREATE TYPE "StockIssuePurpose" AS ENUM ('SCHEDULED', 'REPLACEMENT', 'REPAIR', 'EMERGENCY', 'SUPPLY', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'USED_RETURN', 'WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN', 'INVENTORY_ADJ');

-- DropForeignKey
ALTER TABLE "spare_part_stocks" DROP CONSTRAINT IF EXISTS "spare_part_stocks_office_id_fkey";

-- DropForeignKey
ALTER TABLE "spare_part_stocks" DROP CONSTRAINT IF EXISTS "spare_part_stocks_part_id_fkey";

-- DropTable
-- Остаток «по офису» заменяется остатком «по складу»: у офиса может быть
-- основной склад, кладовая при гараже и накопитель отработанных материалов,
-- и складывать их в одну цифру нельзя. Прежняя таблица хранила только
-- демонстрационные остатки без единого документа за спиной — переносить
-- из неё нечего, а новые остатки рассчитываются из журнала движений.
DROP TABLE "spare_part_stocks";

-- AlterTable
ALTER TABLE "spare_parts" ADD COLUMN     "category" "StockCategory" NOT NULL DEFAULT 'SPARE',
ADD COLUMN     "exchange_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking" "StockTracking" NOT NULL DEFAULT 'QUANTITY';

-- CreateTable
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "WarehouseKind" NOT NULL DEFAULT 'MAIN',
    "location" VARCHAR(240),
    "keeper_user_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avg_price" DECIMAL(16,2),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_documents" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "kind" "StockDocumentKind" NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "document_date" TIMESTAMPTZ(3) NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "target_warehouse_id" INTEGER,
    "supplier_id" INTEGER,
    "external_number" VARCHAR(64),
    "vehicle_id" INTEGER,
    "recipient_driver_id" INTEGER,
    "recipient_user_id" INTEGER,
    "work_order_id" INTEGER,
    "purpose" "StockIssuePurpose",
    "total_amount" DECIMAL(16,2),
    "reason" VARCHAR(400),
    "notes" VARCHAR(400),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "stock_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "office_id" INTEGER NOT NULL,
    "document_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(16,2),
    "total_amount" DECIMAL(16,2),
    "balance_after" DECIMAL(14,3) NOT NULL,
    "moved_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" VARCHAR(240),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_office_id_kind_idx" ON "warehouses"("office_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_office_id_code_key" ON "warehouses"("office_id", "code");

-- CreateIndex
CREATE INDEX "stock_balances_office_id_idx" ON "stock_balances"("office_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_warehouse_id_part_id_key" ON "stock_balances"("warehouse_id", "part_id");

-- CreateIndex
CREATE INDEX "stock_documents_office_id_kind_document_date_idx" ON "stock_documents"("office_id", "kind", "document_date");

-- CreateIndex
CREATE INDEX "stock_documents_office_id_document_date_idx" ON "stock_documents"("office_id", "document_date");

-- CreateIndex
CREATE INDEX "stock_documents_vehicle_id_idx" ON "stock_documents"("vehicle_id");

-- CreateIndex
CREATE INDEX "stock_documents_recipient_driver_id_idx" ON "stock_documents"("recipient_driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_office_id_number_key" ON "stock_documents"("office_id", "number");

-- CreateIndex
CREATE INDEX "stock_movements_office_id_moved_at_idx" ON "stock_movements"("office_id", "moved_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_warehouse_id_part_id_moved_at_idx" ON "stock_movements"("warehouse_id", "part_id", "moved_at");

-- CreateIndex
CREATE INDEX "stock_movements_part_id_moved_at_idx" ON "stock_movements"("part_id", "moved_at");

-- CreateIndex
CREATE INDEX "stock_movements_document_id_idx" ON "stock_movements"("document_id");

-- CreateIndex
CREATE INDEX "spare_parts_category_idx" ON "spare_parts"("category");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_keeper_user_id_fkey" FOREIGN KEY ("keeper_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_recipient_driver_id_fkey" FOREIGN KEY ("recipient_driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "stock_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
