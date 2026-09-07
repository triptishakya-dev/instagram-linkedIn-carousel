-- AlterTable
--
-- Distinguishes "has no models" from "has never had models", so deleting the
-- last AI model does not cause GET /api/models to re-seed the defaults.
--
-- Backfilled for every workspace row that already exists: those users have
-- already been through the seeding path, so stamping them makes a delete they
-- make now stick. A user with models but no settings row needs no backfill --
-- a non-empty list never reaches the seeding branch.
ALTER TABLE "WorkspaceSetting" ADD COLUMN "modelsSeededAt" TIMESTAMP(3);

UPDATE "WorkspaceSetting" SET "modelsSeededAt" = CURRENT_TIMESTAMP;
