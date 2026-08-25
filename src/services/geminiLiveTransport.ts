import { AUDIO_CONFIG, LOGGING } from '../types/index.js';
import type { AudioChunkMetrics, GeminiSession } from '../types/index.js';
import type { GeminiRealtimeTextInput } from '../types/geminiLive.js';
import logger from '../utils/logger.js';

function getAudioMetrics(audioBase64: string): AudioChunkMetrics {
  const audioBytes = Buffer.from(audioBase64, 'base64').length;
  return {
    audioBytes,
    audioSamples: Math.floor(audioBytes / AUDIO_CONFIG.PCM_BYTES_PER_SAMPLE),
  };
}

function recordAudioSendStart(
  sessionId: string,
  entry: GeminiSession,
  audioBase64: string,
  sendStartedAt: number,
  audioMetrics?: AudioChunkMetrics,
): AudioChunkMetrics {
  const metrics = audioMetrics ?? getAudioMetrics(audioBase64);
  entry.audioChunksSent++;
  entry.audioBytesSent = (entry.audioBytesSent ?? 0) + metrics.audioBytes;
  entry.audioSamplesSent = (entry.audioSamplesSent ?? 0) + metrics.audioSamples;
  entry.lastAudioChunkSentAt = sendStartedAt;
  entry.audioSendInFlight = (entry.audioSendInFlight ?? 0) + 1;
  entry.maxAudioSendInFlight = Math.max(
    entry.maxAudioSendInFlight ?? 0,
    entry.audioSendInFlight,
  );

  if (!entry.firstClientAudioAt) {
    entry.firstClientAudioAt = sendStartedAt;
    logger.info('First client audio chunk sent to Gemini', {
      sessionId,
      correlationId: entry.correlationId,
      elapsedMs: entry.firstClientAudioAt - entry.startTime,
      audioBytes: metrics.audioBytes,
      audioSamples: metrics.audioSamples,
    });
  }

  if (entry.audioChunksSent % LOGGING.THROTTLE_CHUNKS === 1) {
    logger.debug('Sending client audio chunk to Gemini', {
      sessionId,
      correlationId: entry.correlationId,
      audioChunksSent: entry.audioChunksSent,
      audioBytes: metrics.audioBytes,
      audioSamples: metrics.audioSamples,
      inFlight: entry.audioSendInFlight,
    });
  }

  return metrics;
}

function recordAudioSendSuccess(
  sessionId: string,
  entry: GeminiSession,
  metrics: AudioChunkMetrics,
  sendStartedAt: number,
): void {
  const sendLatencyMs = Date.now() - sendStartedAt;
  entry.maxAudioSendLatencyMs = Math.max(entry.maxAudioSendLatencyMs ?? 0, sendLatencyMs);
  if (entry.audioChunksSent % LOGGING.THROTTLE_CHUNKS === 1) {
    logger.debug('Client audio chunk accepted by Gemini transport', {
      sessionId,
      correlationId: entry.correlationId,
      audioChunksSent: entry.audioChunksSent,
      audioBytes: metrics.audioBytes,
      audioSamples: metrics.audioSamples,
      sendLatencyMs,
      inFlight: entry.audioSendInFlight,
    });
  }
}

function recordAudioSendFailure(
  sessionId: string,
  entry: GeminiSession,
  metrics: AudioChunkMetrics,
  sendStartedAt: number,
  error: unknown,
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  entry.audioSendFailures = (entry.audioSendFailures ?? 0) + 1;
  logger.error('Error sending audio', {
    sessionId,
    correlationId: entry.correlationId,
    audioChunksSent: entry.audioChunksSent,
    audioBytes: metrics.audioBytes,
    audioSamples: metrics.audioSamples,
    sendLatencyMs: Date.now() - sendStartedAt,
    sendFailures: entry.audioSendFailures,
    error: errMsg,
  });
}

export async function sendAudioToGemini(
  sessionId: string,
  entry: GeminiSession,
  audioBase64: string,
  providedMetrics?: AudioChunkMetrics,
): Promise<void> {
  const sendStartedAt = Date.now();
  const audioMetrics = recordAudioSendStart(
    sessionId,
    entry,
    audioBase64,
    sendStartedAt,
    providedMetrics,
  );

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (entry.session as any).sendRealtimeInput({
      audio: { data: audioBase64, mimeType: AUDIO_CONFIG.MIME_TYPE },
    });
    recordAudioSendSuccess(sessionId, entry, audioMetrics, sendStartedAt);
  } catch (error: unknown) {
    recordAudioSendFailure(sessionId, entry, audioMetrics, sendStartedAt, error);
  } finally {
    entry.audioSendInFlight = Math.max(0, (entry.audioSendInFlight ?? 1) - 1);
  }
}

export async function sendTextToGemini(
  sessionId: string,
  entry: GeminiSession,
  text: string,
  reason: string,
): Promise<boolean> {
  const sendStartedAt = Date.now();
  if (!entry.firstTextPromptAt) entry.firstTextPromptAt = sendStartedAt;

  logger.info('Sending text prompt to Gemini', {
    sessionId,
    reason,
    correlationId: entry.correlationId,
    chars: text.length,
    elapsedMs: sendStartedAt - entry.startTime,
  });

  const payload: GeminiRealtimeTextInput = {
    text,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (entry.session as any).sendRealtimeInput(payload);
    logger.info('Text prompt sent to Gemini', {
      sessionId,
      reason,
      correlationId: entry.correlationId,
      elapsedMs: Date.now() - sendStartedAt,
    });
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error sending text', {
      sessionId,
      reason,
      correlationId: entry.correlationId,
      error: errMsg,
    });
    return false;
  }
}

export async function closeGeminiSession(sessionId: string, entry: GeminiSession): Promise<void> {
  const closeStartedAt = Date.now();
  logger.info('Closing Gemini Live session', {
    sessionId,
    correlationId: entry.correlationId,
    audioChunksSent: entry.audioChunksSent,
    audioBytesSent: entry.audioBytesSent ?? 0,
    audioChunksReceived: entry.audioChunksReceived,
    audioBytesReceived: entry.audioBytesReceived ?? 0,
    audioSendFailures: entry.audioSendFailures ?? 0,
    maxAudioSendInFlight: entry.maxAudioSendInFlight ?? 0,
    maxAudioSendLatencyMs: entry.maxAudioSendLatencyMs ?? 0,
    maxAudioInterArrivalMs: entry.maxAudioInterArrivalMs ?? 0,
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (entry.session as any).close();
    logger.info('Gemini Live session close completed', {
      sessionId,
      correlationId: entry.correlationId,
      closeLatencyMs: Date.now() - closeStartedAt,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error closing Gemini session', {
      sessionId,
      correlationId: entry.correlationId,
      closeLatencyMs: Date.now() - closeStartedAt,
      error: errMsg,
    });
  }
}
