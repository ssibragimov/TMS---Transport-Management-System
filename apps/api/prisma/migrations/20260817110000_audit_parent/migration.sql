-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "parent_entity" VARCHAR(64),
ADD COLUMN     "parent_id" VARCHAR(64);

-- CreateIndex
CREATE INDEX "audit_logs_parent_entity_parent_id_idx" ON "audit_logs"("parent_entity", "parent_id");
