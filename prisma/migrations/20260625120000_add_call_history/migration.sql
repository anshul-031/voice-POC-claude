-- CreateTable
CREATE TABLE "call_history" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "callType" TEXT NOT NULL DEFAULT 'test',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "direction" TEXT,
    "phoneNumber" TEXT,
    "agentName" TEXT NOT NULL,
    "durationSecs" INTEGER NOT NULL DEFAULT 0,
    "recordingKey" TEXT,
    "recordingMimeType" TEXT,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "agentId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_history_sessionId_key" ON "call_history"("sessionId");

-- CreateIndex
CREATE INDEX "call_history_userId_idx" ON "call_history"("userId");

-- CreateIndex
CREATE INDEX "call_history_agentId_idx" ON "call_history"("agentId");

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "voice_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
