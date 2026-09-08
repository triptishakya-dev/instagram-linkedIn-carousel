-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('CAPTION', 'IMAGE');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('OK', 'FAILED');

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "goalId" TEXT,
    "postId" TEXT,
    "generationRunId" TEXT,
    "modelId" TEXT,
    "provider" TEXT NOT NULL,
    "apiModelId" TEXT NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "imageCount" INTEGER,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "quality" TEXT,
    "costInr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "status" "UsageStatus" NOT NULL,
    "errorMessage" TEXT,
    "langfuseTraceId" TEXT,
    "langfuseGenerationId" TEXT,
    "attempt" INTEGER,
    "providerRequestId" TEXT,
    "isBackfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_invocationId_key" ON "UsageEvent"("invocationId");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_goalId_createdAt_idx" ON "UsageEvent"("goalId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_postId_idx" ON "UsageEvent"("postId");

-- CreateIndex
CREATE INDEX "UsageEvent_generationRunId_idx" ON "UsageEvent"("generationRunId");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_status_createdAt_idx" ON "UsageEvent"("userId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
