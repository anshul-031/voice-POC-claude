-- Sales Analyser integration: account-level credentials on users
ALTER TABLE "users"
  ADD COLUMN "salesAnalyserEmail" TEXT,
  ADD COLUMN "salesAnalyserPassword" TEXT;

-- Sales Analyser integration: per-agent analysis configuration
ALTER TABLE "voice_agents"
  ADD COLUMN "callAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "analysisTemplateName" TEXT;
