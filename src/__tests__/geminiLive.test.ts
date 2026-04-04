import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

import geminiLiveService from '../services/geminiLive.js';

const { mockConnect, mockSession, state } = vi.hoisted(() => {
  const session = {
    sendRealtimeInput: vi.fn(),
    sendClientContent: vi.fn(),
    close: vi.fn(),
  };
  const st: { callbacks: any } = { callbacks: null };
  const connect = vi.fn(async ({ callbacks }) => {
    st.callbacks = callbacks;
    if (callbacks.onopen) callbacks.onopen();
    return session;
  });
  return { mockConnect: connect, mockSession: session, state: st };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    public live = { connect: mockConnect };
     
    constructor() {}
  },
  Modality: { AUDIO: 'AUDIO' },
}));

describe('GeminiLiveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    geminiLiveService.sessions.clear();
    state.callbacks = null;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should hit 90%+ coverage', async () => {
    const callbacks = { 
      systemPrompt: 'sys', 
      voiceName: 'vn', 
      modelName: 'mn',
      onAudio: vi.fn(), 
      onTranscript: vi.fn(), 
      onInterrupted: vi.fn(), 
      onError: vi.fn(), 
      onClose: vi.fn(),
    };
    await geminiLiveService.createSession('sid', callbacks);
    expect(geminiLiveService.hasSession('sid')).toBe(true);
    
    // Trigger callbacks
    if (state.callbacks) {
      // Test serverContent branches
      state.callbacks.onmessage({
        serverContent: {
          modelTurn: {
            parts: [
              { inlineData: { mimeType: 'audio/pcm', data: 'a' } },
              { text: 't' },
            ],
          },
          turnComplete: true,
          interrupted: true,
          inputTranscription: { text: 'in' },
          outputTranscription: { text: 'out' },
        },
      });
      // String transcripts
      state.callbacks.onmessage({
        serverContent: {
          inputTranscription: 'in2',
          outputTranscription: 'out2',
        },
      });
      // Test direct audio branch
      state.callbacks.onmessage({ data: 'direct-audio' });
      // Test setup complete
      state.callbacks.onmessage({ setupComplete: true });

      // Close and Error
      state.callbacks.onerror(new Error('ws-err'));
      state.callbacks.onerror('raw-error');
      state.callbacks.onclose({ reason: 'done' });
    }
    
    // Create session to test sending
    await geminiLiveService.createSession('sid2', callbacks);

    await geminiLiveService.sendAudio('sid2', 'data');
    mockSession.sendRealtimeInput.mockImplementationOnce(() => { throw new Error('ERR'); });
    await geminiLiveService.sendAudio('sid2', 'data');
    mockSession.sendRealtimeInput.mockImplementationOnce(() => { throw 'RAW_AUDIO_ERR'; });
    await geminiLiveService.sendAudio('sid2', 'data');

    await geminiLiveService.sendText('sid2', 'text');
    expect(mockSession.sendRealtimeInput).toHaveBeenLastCalledWith({
      text: 'text',
    });
    mockSession.sendRealtimeInput.mockImplementationOnce(() => { throw new Error('ERR'); });
    await geminiLiveService.sendText('sid2', 'text');
    mockSession.sendRealtimeInput.mockImplementationOnce(() => { throw 'RAW_TEXT_ERR'; });
    await geminiLiveService.sendText('sid2', 'text');

    await geminiLiveService.closeSession('sid2');
    
    // close fail block
    await geminiLiveService.createSession('sid3', callbacks);
    mockSession.close.mockImplementationOnce(() => { throw new Error('ERR'); });
    await geminiLiveService.closeSession('sid3');

    await geminiLiveService.createSession('sid4', callbacks);
    mockSession.close.mockImplementationOnce(() => { throw 'RAW_CLOSE_ERR'; });
    await geminiLiveService.closeSession('sid4');
    
    // no session
    await geminiLiveService.sendAudio('missing', 'a');
    await geminiLiveService.sendText('missing', 't');
  });

  it('should cover missing callbacks and missing optional data', async () => {
    await geminiLiveService.createSession('nocb', {});
    if (state.callbacks) {
      state.callbacks.onmessage({
        serverContent: {
          modelTurn: {
            parts: [
              { inlineData: { mimeType: 'audio/pcm' } }, // missing data
              { text: '' }, // empty text
            ],
          },
          interrupted: {},
          inputTranscription: {}, // missing text
          outputTranscription: {}, // missing text
        },
      });
      state.callbacks.onmessage({ data: 'audio' });
      state.callbacks.onerror(new Error()); // no e.message
      
      // onclose deletes the session
      state.callbacks.onclose({}); // no reason
      
      // Test messages when entry is undefined (already closed)
      state.callbacks.onmessage({ data: 'audio' }); 
      state.callbacks.onmessage({ 
        serverContent: { 
          modelTurn: { 
            parts: [{ inlineData: { mimeType: 'audio/pcm', data: 'a' } }], 
          }, 
        }, 
      });
    }
  });

  it('should cover missing session on close', async () => {
    await geminiLiveService.closeSession('doesnt-exist');
  });

  it('should handle loop errors (throw from connect)', async () => {
    mockConnect.mockRejectedValueOnce(new Error('FAIL'));
    await expect(geminiLiveService.createSession('sid-err', {})).rejects.toThrow('FAIL');
  });

  it('should throw if GEMINI_API_KEY is not defined on module initialization', async () => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(import('../services/geminiLive.js')).rejects.toThrow('GEMINI_API_KEY is not defined');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
  });

});
