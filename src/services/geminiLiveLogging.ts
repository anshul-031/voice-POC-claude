import logger from '../utils/logger.js';
import { LIVE_CALL, LOGGING } from '../types/index.js';
import type { GeminiSession } from '../types/index.js';

function toMessageObject(message: unknown): Record<string, unknown> | null {
  if (!message || typeof message !== 'object') {
    return null;
  }
  return message as Record<string, unknown>;
}

function elapsedMs(entry?: GeminiSession): number | undefined {
  if (!entry) {
    return undefined;
  }
  return Date.now() - entry.startTime;
}

export function logMessageEnvelope(sessionId: string, message: unknown): void {
  const payload = toMessageObject(message);

  logger.debug('Gemini message received', {
    sessionId,
    keys: payload ? Object.keys(payload) : [],
    hasServerContent: !!payload?.serverContent,
    hasDirectData: !!payload?.data,
    hasSetupComplete: !!payload?.setupComplete,
    hasToolCall: !!payload?.toolCall,
    hasUsageMetadata: !!payload?.usageMetadata,
  });
}

export function logTurnComplete(sessionId: string, entry?: GeminiSession): void {
  logger.info('Gemini server turn complete', {
    sessionId,
    correlationId: entry?.correlationId,
    elapsedMs: elapsedMs(entry),
    audioChunksSent: entry?.audioChunksSent,
    audioChunksReceived: entry?.audioChunksReceived,
  });
}

export function logGenerationComplete(sessionId: string, entry?: GeminiSession): void {
  logger.info('Gemini generation complete', {
    sessionId,
    correlationId: entry?.correlationId,
    elapsedMs: elapsedMs(entry),
  });
}

export function getTranscriptText(transcription: unknown): string {
  const withText = transcription as { text?: unknown };
  const textCandidate = withText?.text ?? transcription;
  return typeof textCandidate === 'string' ? textCandidate : JSON.stringify(textCandidate);
}

export function logTranscriptMilestone(
  sessionId: string,
  entry: GeminiSession | undefined,
  role: 'user' | 'model',
  now: number,
): void {
  if (!entry) {
    return;
  }

  if (role === 'user' && !entry.firstUserTranscriptAt) {
    entry.firstUserTranscriptAt = now;
    logger.info('First user transcript received from Gemini', {
      sessionId,
      correlationId: entry.correlationId,
      elapsedMs: now - entry.startTime,
      sinceFirstClientAudioMs: entry.firstClientAudioAt ? now - entry.firstClientAudioAt : undefined,
    });
    return;
  }

  if (role === 'model' && !entry.firstModelTranscriptAt) {
    entry.firstModelTranscriptAt = now;
    logger.info('First model transcript received from Gemini', {
      sessionId,
      correlationId: entry.correlationId,
      elapsedMs: now - entry.startTime,
      sinceFirstClientAudioMs: entry.firstClientAudioAt ? now - entry.firstClientAudioAt : undefined,
    });
  }
}

export function logTranscriptPayload(sessionId: string, role: 'user' | 'model', text: string): void {
  logger.info(`${role === 'user' ? 'User' : 'Output'} transcript received`, { sessionId, text });
}

export function markFirstModelAudio(
  sessionId: string,
  entry: GeminiSession | undefined,
  now: number,
): void {
  if (!entry || entry.firstModelAudioAt) {
    return;
  }

  entry.firstModelAudioAt = now;
  logger.info('First model audio chunk received from Gemini', {
    sessionId,
    correlationId: entry.correlationId,
    elapsedMs: now - entry.startTime,
    sinceFirstClientAudioMs: entry.firstClientAudioAt ? now - entry.firstClientAudioAt : undefined,
    sinceFirstUserTranscriptMs: entry.firstUserTranscriptAt ? now - entry.firstUserTranscriptAt : undefined,
  });

  const firstResponseLatencyMs = now - entry.startTime;
  if (!entry.firstResponseLatencyWarned && firstResponseLatencyMs > LIVE_CALL.FIRST_RESPONSE_WARN_THRESHOLD_MS) {
    entry.firstResponseLatencyWarned = true;
    logger.warn('First model response exceeded target latency', {
      sessionId,
      correlationId: entry.correlationId,
      firstResponseLatencyMs,
      thresholdMs: LIVE_CALL.FIRST_RESPONSE_WARN_THRESHOLD_MS,
      audioChunksSent: entry.audioChunksSent,
    });
  }
}

export function shouldLogChunkProgress(chunkCount: number): boolean {
  return chunkCount === 1 || chunkCount % LOGGING.THROTTLE_CHUNKS === 0;
}
