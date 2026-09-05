-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "captionPrompt" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "intendedPlatforms" "Platform"[],
ADD COLUMN     "staleAfterMinutes" INTEGER NOT NULL DEFAULT 30;

-- CreateIndex
CREATE UNIQUE INDEX "Post_idempotencyKey_key" ON "Post"("idempotencyKey");
