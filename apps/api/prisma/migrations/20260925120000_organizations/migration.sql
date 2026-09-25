-- Организации: уровень между платформой и офисами.

CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name_ru" VARCHAR(160) NOT NULL,
    "name_uz" VARCHAR(160) NOT NULL,
    "name_en" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- Все существующие офисы — «Аэропорты Узбекистана».
INSERT INTO "organizations" ("code", "name_ru", "name_uz", "name_en", "updated_at")
VALUES ('UZAIR', 'Аэропорты Узбекистана', 'O‘zbekiston aeroportlari', 'Airports of Uzbekistan', CURRENT_TIMESTAMP);

ALTER TABLE "offices" ADD COLUMN "organization_id" INTEGER;

UPDATE "offices"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "code" = 'UZAIR');

-- Офис DUK (TOSHSHAHARNUR), если он уже заведён, выделяется в собственную организацию.
INSERT INTO "organizations" ("code", "name_ru", "name_uz", "name_en", "updated_at")
SELECT 'TSHN', 'TOSHSHAHARNUR', 'TOSHSHAHARNUR', 'TOSHSHAHARNUR', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "offices" WHERE "code" = 'DUK');

UPDATE "offices"
SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "code" = 'TSHN')
WHERE "code" = 'DUK';

ALTER TABLE "offices" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "offices"
  ADD CONSTRAINT "offices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "offices_organization_id_idx" ON "offices"("organization_id");

-- Право управления платформой — только у суперадминистратора.
-- Сид на рабочем сервере не запускается, поэтому право заводится здесь.
INSERT INTO "permissions" ("code", "group_code")
VALUES ('platform.manage', 'platform')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r, "permissions" p
WHERE r."code" = 'SUPER_ADMIN' AND p."code" = 'platform.manage'
ON CONFLICT DO NOTHING;
