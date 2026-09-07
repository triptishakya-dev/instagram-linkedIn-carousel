-- CreateEnum
CREATE TYPE "GenerationTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "AiModel" ADD COLUMN     "apiModelId" TEXT;

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "infographicDetails" JSONB,
ADD COLUMN     "recentTopics" JSONB DEFAULT '[]',
ADD COLUMN     "slideCount" INTEGER,
ADD COLUMN     "visualStyle" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "estimatedCostInr" DOUBLE PRECISION,
ADD COLUMN     "generationMs" INTEGER,
ADD COLUMN     "generationRunId" TEXT,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "modelId" TEXT,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "runCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "PostMedia" ADD COLUMN     "body" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "negativePrompt" TEXT,
ADD COLUMN     "prompt" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "trigger" "GenerationTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "workflowId" TEXT,
    "runId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationRun_userId_createdAt_idx" ON "GenerationRun"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
