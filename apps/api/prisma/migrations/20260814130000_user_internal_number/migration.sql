-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "internal_number" VARCHAR(4);

-- CreateIndex
CREATE INDEX "users_internal_number_idx" ON "users"("internal_number");
