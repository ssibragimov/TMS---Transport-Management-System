-- Шаг 2: администратор организации; раскладка задания и логотип на уровне организации.

-- ── Настройки организации ───────────────────────────────────────────────
ALTER TABLE "organizations"
  ADD COLUMN "task_layout" "WaybillTaskLayout" NOT NULL DEFAULT 'FLIGHT',
  ADD COLUMN "task_address_a_locations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "logo_key" VARCHAR(400),
  ADD COLUMN "logo_mime_type" VARCHAR(60);

-- Организация берёт ту раскладку, которая чаще встречается у её офисов, —
-- поведение существующих офисов не меняется.
UPDATE "organizations" o
SET "task_layout" = pick."task_layout",
    "task_address_a_locations" = pick."task_address_a_locations"
FROM (
  SELECT DISTINCT ON ("organization_id") "organization_id", "task_layout", "task_address_a_locations"
  FROM (
    SELECT "organization_id", "task_layout", "task_address_a_locations", COUNT(*) AS cnt
    FROM "offices"
    WHERE "deleted_at" IS NULL
    GROUP BY "organization_id", "task_layout", "task_address_a_locations"
  ) grouped
  ORDER BY "organization_id", cnt DESC
) pick
WHERE pick."organization_id" = o."id";

-- У офиса раскладка теперь необязательна: NULL — «как у организации».
ALTER TABLE "offices"
  ALTER COLUMN "task_layout" DROP NOT NULL,
  ALTER COLUMN "task_layout" DROP DEFAULT,
  ALTER COLUMN "task_address_a_locations" DROP NOT NULL,
  ALTER COLUMN "task_address_a_locations" DROP DEFAULT;

-- Совпадающее с организацией значение больше не хранится в офисе.
UPDATE "offices" f
SET "task_layout" = NULL,
    "task_address_a_locations" = NULL
FROM "organizations" o
WHERE f."organization_id" = o."id"
  AND f."task_layout" = o."task_layout"
  AND f."task_address_a_locations" = o."task_address_a_locations";

-- ── Администраторы организаций ──────────────────────────────────────────
CREATE TABLE "user_organizations" (
    "user_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("user_id", "organization_id")
);

CREATE INDEX "user_organizations_organization_id_idx" ON "user_organizations"("organization_id");

ALTER TABLE "user_organizations"
  ADD CONSTRAINT "user_organizations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_organizations"
  ADD CONSTRAINT "user_organizations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Роль «Администратор организации»: те же права, что у администратора офиса.
-- Сид на рабочем сервере не запускается, поэтому роль заводится здесь.
INSERT INTO "roles" ("code", "name", "is_system", "updated_at")
VALUES ('ORG_ADMIN', 'Администратор организации', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT org."id", rp."permission_id"
FROM "roles" org
JOIN "roles" src ON src."code" = 'OFFICE_ADMIN'
JOIN "role_permissions" rp ON rp."role_id" = src."id"
WHERE org."code" = 'ORG_ADMIN'
ON CONFLICT DO NOTHING;
