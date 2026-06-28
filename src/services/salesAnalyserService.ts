/**
 * Sales Analyser integration service.
 *
 * After a call recording is uploaded to Cloudflare R2, this service forwards a
 * time-limited (7-day) signed URL of that recording to the Sales Analyser app
 * for analysis — WITHOUT re-uploading or persisting the audio anywhere else.
 *
 * The Sales Analyser app exposes POST /api/external/analyze, which:
 *   - authenticates via a Bearer JWT obtained from POST /api/auth/login
 *   - resolves a human-friendly templateName to an analysis template
 *   - streams the audio directly from the signed URL (never stores a copy)
 *
 * The whole flow is best-effort: any failure is logged and swallowed so it can
 * never break or delay an ending call. Triggering is gated by:
 *   - SALES_ANALYSER_URL being configured (env)
 *   - the agent having callAnalysisEnabled === true and an analysisTemplateName
 *   - the account having Sales Analyser credentials saved
 */
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { SALES_ANALYSER_URL } from '../constants/config.js';
import { getSignedRecordingUrl } from './r2Storage.js';

/** Cloudflare R2 / AWS SigV4 presigned URLs cap out at exactly 7 days. */
const ANALYSIS_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 20000;

/** Minimal shape of the finalized call record needed to trigger analysis. */
export interface CallAnalysisContext {
  id: string;
  sessionId: string;
  agentId: string | null;
  userId: string | null;
  phoneNumber: string | null;
  recordingKey: string | null;
  recordingMimeType: string | null;
}

/** Perform a JSON fetch with a hard timeout. Returns the parsed body + status. */
async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(controller.abort.bind(controller), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON / empty body — leave as {}.
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Authenticate against the Sales Analyser app and return a Bearer JWT. */
async function login(baseUrl: string, email: string, password: string): Promise<string | null> {
  const { ok, status, body } = await fetchJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const token = typeof body.token === 'string' ? body.token : null;
  if (!ok || !token) {
    logger.error('Sales Analyser login failed', {
      status,
      error: typeof body.message === 'string' ? body.message : undefined,
    });
    return null;
  }
  return token;
}

/**
 * Resolve all the inputs required to trigger analysis. Returns null (and logs
 * the reason at debug/info level) when the integration is not applicable.
 */
async function resolveAnalysisRequest(call: CallAnalysisContext): Promise<{
  templateName: string;
  email: string;
  password: string;
} | null> {
  if (!call.agentId || !call.userId) {
    return null;
  }

  const agent = await prisma.voiceAgent.findUnique({
    where: { id: call.agentId },
    select: { callAnalysisEnabled: true, analysisTemplateName: true },
  });
  if (!agent?.callAnalysisEnabled || !agent.analysisTemplateName) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: call.userId },
    select: { salesAnalyserEmail: true, salesAnalyserPassword: true },
  });
  if (!user?.salesAnalyserEmail || !user.salesAnalyserPassword) {
    logger.warn('Call analysis enabled but Sales Analyser credentials are not configured', {
      sessionId: call.sessionId,
      agentId: call.agentId,
    });
    return null;
  }

  return {
    templateName: agent.analysisTemplateName,
    email: user.salesAnalyserEmail,
    password: user.salesAnalyserPassword,
  };
}

/** POST the signed recording to the external analyze endpoint. Best-effort. */
async function submitAnalysis(
  baseUrl: string,
  token: string,
  recordingUrl: string,
  templateName: string,
  call: CallAnalysisContext,
): Promise<void> {
  const { ok, status, body } = await fetchJson(`${baseUrl}/api/external/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      recordingUrl,
      templateName,
      mimeType: call.recordingMimeType ?? undefined,
      phoneNumber: call.phoneNumber ?? undefined,
      externalId: call.sessionId,
    }),
  });

  if (!ok) {
    logger.error('Sales Analyser analysis request failed', {
      sessionId: call.sessionId,
      status,
      error: typeof body.error === 'string' ? body.error : undefined,
    });
    return;
  }

  logger.info('Call recording submitted for analysis', {
    sessionId: call.sessionId,
    agentId: call.agentId,
    templateName,
    uploadId: body.uploadId,
  });
}

/**
 * Send a completed call recording to the Sales Analyser app for analysis.
 * Best-effort: never throws. Safe to invoke as `void triggerCallAnalysis(...)`.
 */
export async function triggerCallAnalysis(call: CallAnalysisContext): Promise<void> {
  try {
    if (!SALES_ANALYSER_URL || !call.recordingKey) {
      return;
    }

    const request = await resolveAnalysisRequest(call);
    if (!request) {
      return;
    }

    const recordingUrl = await getSignedRecordingUrl(
      call.recordingKey,
      ANALYSIS_SIGNED_URL_TTL_SECONDS,
    );
    if (!recordingUrl) {
      logger.error('Could not sign recording URL for analysis', {
        sessionId: call.sessionId,
        recordingKey: call.recordingKey,
      });
      return;
    }

    const token = await login(SALES_ANALYSER_URL, request.email, request.password);
    if (!token) {
      return;
    }

    await submitAnalysis(SALES_ANALYSER_URL, token, recordingUrl, request.templateName, call);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to trigger call analysis', { sessionId: call.sessionId, error: errMsg });
  }
}
