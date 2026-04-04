import { AUDIO_CONFIG, LOGGING } from '../types/index.js';
import type { GeminiSession } from '../types/index.js';
import type { GeminiRealtimeTextInput } from '../types/geminiLive.js';
import logger from '../utils/logger.js';

export async function sendAudioToGemini(
  sessionId: string,
  entry: GeminiSession,
  audioBase64: string,
): Promise<void> {
  entry.audioChunksSent++;
  entry.lastAudioChunkSentAt = Date.now();

  if (!entry.firstClientAudioAt) {
    entry.firstClientAudioAt = entry.lastAudioChunkSentAt;
    logger.info('First client audio chunk sent to Gemini', {
      sessionId,
      correlationId: entry.correlationId,
      elapsedMs: entry.firstClientAudioAt - entry.startTime,
    });
  }

  if (entry.audioChunksSent % LOGGING.THROTTLE_CHUNKS === 1) {
    logger.debug('Sending client audio chunk to Gemini', {
      sessionId,
      correlationId: entry.correlationId,
      audioChunksSent: entry.audioChunksSent,
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (entry.session as any).sendRealtimeInput({
      audio: { data: audioBase64, mimeType: AUDIO_CONFIG.MIME_TYPE },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error sending audio', {
      sessionId,
      correlationId: entry.correlationId,
      audioChunksSent: entry.audioChunksSent,
      error: errMsg,
    });
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
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (entry.session as any).close();
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error closing Gemini session', { sessionId, error: errMsg });
  }
}
