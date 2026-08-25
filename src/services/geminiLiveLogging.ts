import logger from '../utils/logger.js';
import { AUDIO_CONFIG, LIVE_CALL, LOGGING } from '../types/index.js';
import type { AudioChunkMetrics, GeminiSession } from '../types/index.js';

/**
 * Update the session counters for one model PCM chunk without retaining or
 * logging the audio payload itself.
 * @param {string} sessionId
 * @param {GeminiSession | undefined} entry
 * @param {string} data
 * @param {number} now
 * @returns {AudioChunkMetrics}
 */
export function recordModelAudioChunk(
  sessionId: string,
  entry: GeminiSession | undefined,
  data: string,
  now: number,
): AudioChunkMetrics {
  const audioBytes = Buffer.from(data, 'base64').length;
  const audioSamples = Math.floor(audioBytes / AUDIO_CONFIG.PCM_BYTES_PER_SAMPLE);
  const interArrivalMs = entry?.lastAudioChunkReceivedAt
    ? now - entry.lastAudioChunkReceivedAt
    : undefined;
  if (entry) {
    entry.audioChunksReceived++;
    entry.audioBytesReceived = (entry.audioBytesReceived ?? 0) + audioBytes;
    entry.audioSamplesReceived = (entry.audioSamplesReceived ?? 0) + audioSamples;
    entry.lastAudioChunkReceivedAt = now;
    if (interArrivalMs !== undefined) {
      entry.maxAudioInterArrivalMs = Math.max(entry.maxAudioInterArrivalMs ?? 0, interArrivalMs);
    }
    markFirstModelAudio(sessionId, entry, now);
  }
  return { audioBytes, audioSamples, interArrivalMs };
}

/** @param {string} sessionId @param {GeminiSession} entry @param {AudioChunkMetrics} metrics @returns {void} */
export function logModelAudioChunk(sessionId: string, entry: GeminiSession, metrics: AudioChunkMetrics): void {
  logger.debug('Audio data received', {
    sessionId,
    totalReceived: entry.audioChunksReceived,
    audioBytes: metrics.audioBytes,
    audioSamples: metrics.audioSamples,
    interArrivalMs: metrics.interArrivalMs,
    maxInterArrivalMs: entry.maxAudioInterArrivalMs,
    correlationId: entry.correlationId,
  });
}

/** @param {string} sessionId @param {GeminiSession | undefined} entry @param {AudioChunkMetrics} metrics @param {number} callbackLatencyMs @returns {void} */
export function logSlowModelAudioRelay(
  sessionId: string,
  entry: GeminiSession | undefined,
  metrics: AudioChunkMetrics,
  callbackLatencyMs: number,
): void {
  if (
    callbackLatencyMs <= LOGGING.AUDIO_INTERARRIVAL_WARN_MS
    || (entry && entry.audioChunksReceived % LOGGING.THROTTLE_CHUNKS !== 1)
  ) return;
  logger.warn('Model audio relay callback was slow', {
    sessionId,
    callbackLatencyMs,
    audioBytes: metrics.audioBytes,
    correlationId: entry?.correlationId,
  });
}


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
  logger.debug(`${role === 'user' ? 'User' : 'Output'} transcript chunk received`, {
    sessionId,
    role,
    chars: text.length,
  });
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
