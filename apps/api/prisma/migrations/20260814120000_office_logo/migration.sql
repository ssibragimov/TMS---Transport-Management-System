-- Логотип аэропорта. Оба поля nullable: у существующих офисов логотипа нет,
-- и требовать его задним числом нельзя.
ALTER TABLE "offices" ADD COLUMN "logo_key" VARCHAR(400);
ALTER TABLE "offices" ADD COLUMN "logo_mime_type" VARCHAR(60);
