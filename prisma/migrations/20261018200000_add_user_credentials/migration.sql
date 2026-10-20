ALTER TABLE "app_user"
  ADD COLUMN "email" VARCHAR(320),
  ADD COLUMN "password_hash" VARCHAR(255);

-- Existing development users must be assigned credentials before this migration can be
-- applied to a database containing users. This migration is intentionally fail-closed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "app_user" WHERE "email" IS NULL OR "password_hash" IS NULL) THEN
    RAISE EXCEPTION 'Cannot add required credentials: existing app_user rows need email and password_hash values';
  END IF;
END $$;

ALTER TABLE "app_user" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "app_user" ALTER COLUMN "password_hash" SET NOT NULL;
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");
