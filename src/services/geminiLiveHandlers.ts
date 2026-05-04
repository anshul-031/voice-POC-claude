import logger from '../utils/logger.js';
import {
  getTranscriptText,
  logTranscriptMilestone,
  logTranscriptPayload,
  markFirstModelAudio,
  shouldLogChunkProgress,
} from './geminiLiveLogging.js';
import type { GeminiSession, Transcript } from '../types/index.js';
import type { GeminiTurnPart } from '../types/geminiLive.js';

export function stripThoughtBlocks(text: string): string {
  return text.replace(/\*\*[^]*?\*\*/g, '').trim();
}

export function processDirectAudio(params: {
  sessionId: string;
  data: string;
  entry?: GeminiSession;
  onAudio?: (audio: string) => void;
}): void {
  const { sessionId, data, entry, onAudio } = params;
  const now = Date.now();

  if (entry) {
    entry.audioChunksReceived++;
    markFirstModelAudio(sessionId, entry, now);
    if (shouldLogChunkProgress(entry.audioChunksReceived)) {
      logger.debug('Audio data received', {
        sessionId,
        totalReceived: entry.audioChunksReceived,
        correlationId: entry.correlationId,
      });
    }
  }

  if (onAudio) {
    onAudio(data);
  }
}

export function processModelTurnParts(params: {
  sessionId: string;
  parts: GeminiTurnPart[];
  entry?: GeminiSession;
  onAudio?: (audio: string) => void;
  onTranscript?: (transcript: Transcript) => void;
}): void {
  const { sessionId, parts, entry, onAudio, onTranscript } = params;

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
      processDirectAudio({ sessionId, data: part.inlineData.data, entry, onAudio });
    }
    if (part.text && onTranscript) {
      const filteredText = stripThoughtBlocks(part.text);
      if (filteredText) {
        onTranscript({ role: 'model', text: filteredText });
      }
    }
  }
}

export function processTranscription(params: {
  sessionId: string;
  transcription: unknown;
  role: 'user' | 'model';
  entry?: GeminiSession;
  onTranscript?: (transcript: Transcript) => void;
}): void {
  const { sessionId, transcription, role, entry, onTranscript } = params;
  const now = Date.now();
  const finalMsg = stripThoughtBlocks(getTranscriptText(transcription));

  logTranscriptMilestone(sessionId, entry, role, now);
  logTranscriptPayload(sessionId, role, finalMsg);
  if (onTranscript && finalMsg) {
    onTranscript({ role, text: finalMsg });
  }
}
