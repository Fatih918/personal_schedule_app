-- Google OAuth-only identity. Existing password-only accounts are deliberately not auto-linked
-- by email because historical email ownership was not verified. Such accounts require a
-- separately verified administrative migration before their existing data can be reclaimed.
ALTER TABLE "app_user" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "app_user" ADD COLUMN "google_subject" VARCHAR(255);
CREATE UNIQUE INDEX "app_user_google_subject_key" ON "app_user"("google_subject");
