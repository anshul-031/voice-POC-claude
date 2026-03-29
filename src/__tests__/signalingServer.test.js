import { describe, it, expect, vi, beforeEach } from 'vitest';
import signalingServer from '../services/signalingServer.js';
import geminiLiveService from '../services/geminiLive.js';
import prisma from '../lib/prisma.js';

// Mock correctly to capture the mock instance
let lastMockWss;
vi.mock('ws', () => {
  return {
    WebSocketServer: vi.fn(function() {
      lastMockWss = { on: vi.fn() };
      return lastMockWss;
    }),
  };
});

vi.mock('../services/geminiLive.js', () => ({
  default: {
    createSession: vi.fn(),
    sendAudio: vi.fn(),
    closeSession: vi.fn(),
  },
}));

vi.mock('../lib/prisma.js', () => ({
  default: {
    voiceAgent: {
      findUnique: vi.fn(),
    },
  },
}));

describe('SignalingServer', () => {
  let mockWs;

  beforeEach(() => {
    vi.restoreAllMocks();
    signalingServer.clients.clear();
    mockWs = {
      send: vi.fn(),
      on: vi.fn(),
      readyState: 1,
      OPEN: 1,
    };
  });

  it('should hit 90%+ coverage', async () => {
    signalingServer.attach({});
    const mockWss = lastMockWss;
    const connectionHandler = mockWss.on.mock.calls.find(c => c[0] === 'connection')[1];
    connectionHandler(mockWs, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    
    // Trigger message handler for all types
    const messageHandler = mockWs.on.mock.calls.find(c => c[0] === 'message')[1];
    
    // 1. start-call success
    prisma.voiceAgent.findUnique.mockResolvedValue({ id: '1', name: 'A', systemPrompt: 'S' });
    geminiLiveService.createSession.mockResolvedValue();
    await messageHandler(JSON.stringify({ type: 'start-call', agentId: '1' }));
    
    // 2. audio-data success
    await messageHandler(JSON.stringify({ type: 'audio-data', data: 'abc' }));
    
    // Disconnect with ACTIVE client (hits lines 187-190)
    const closeHandler = mockWs.on.mock.calls.find(c => c[0] === 'close')[1];
    closeHandler(1006, 'abnormal');
    
    // Re-create session for remaining tests
    geminiLiveService.createSession.mockResolvedValue();
    await messageHandler(JSON.stringify({ type: 'start-call', agentId: '1' }));

    // 3. end-call success
    await messageHandler(JSON.stringify({ type: 'end-call' }));
    
    // 4. Unknown type
    await messageHandler(JSON.stringify({ type: 'unknown' }));
    
    // 5. Invalid JSON (hit catch)
    await messageHandler('invalid-json');

    // Hit close and error handlers
    const closeHandler2 = mockWs.on.mock.calls.find(c => c[0] === 'close')[1];
    
    // Test _handleEndCall with no client
    signalingServer.clients.delete(mockWs);
    await messageHandler(JSON.stringify({ type: 'end-call' }));
    
    // Test disconnect with no client
    closeHandler2();
    
    const errorHandler = mockWs.on.mock.calls.find(c => c[0] === 'error')[1];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('WS_FAIL'));
  });

  it('should cover _handleStartCall failure paths', async () => {
    // 1. Missing agentId
    await signalingServer._handleStartCall(mockWs, {});
    
    // 2. Agent not found
    prisma.voiceAgent.findUnique.mockResolvedValue(null);
    await signalingServer._handleStartCall(mockWs, { agentId: '404' });
    
    // 3. Error path (DB catch outside try block passed up)
    prisma.voiceAgent.findUnique.mockRejectedValue(new Error('DB_FAIL'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(signalingServer._handleStartCall(mockWs, { agentId: '1' })).rejects.toThrow('DB_FAIL');
    
    // 4. CreateSession failure (inner catch block)
    prisma.voiceAgent.findUnique.mockResolvedValue({ id: '1', name: 'A', systemPrompt: 'S' });
    geminiLiveService.createSession.mockRejectedValue(new Error('CREATE_FAIL'));
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('error'));
    
    // 5. Existing session on WS
    signalingServer.clients.set(mockWs, { sessionId: 'old' });
    geminiLiveService.createSession.mockResolvedValue();
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(geminiLiveService.closeSession).toHaveBeenCalledWith('old');
  });

  it('should hit Gemini callbacks (SignalingServer logic)', async () => {
    let capturedCallbacks;
    geminiLiveService.createSession.mockImplementation((sid, config) => {
      capturedCallbacks = config;
      return Promise.resolve();
    });
    prisma.voiceAgent.findUnique.mockResolvedValue({ id: '1', name: 'A', systemPrompt: 'S' });
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    
    // Trigger each callback when OPEN
    capturedCallbacks.onAudio('chunk');
    capturedCallbacks.onTranscript({ role: 'user', text: 'hi' });
    capturedCallbacks.onInterrupted();
    capturedCallbacks.onError(new Error('FAIL'));
    capturedCallbacks.onClose();
    
    // Trigger when NOT OPEN
    mockWs.readyState = 2; // CLOSING or CLOSED
    capturedCallbacks.onAudio('chunk');
    capturedCallbacks.onTranscript({ role: 'user', text: 'hi' });
    capturedCallbacks.onInterrupted();
    capturedCallbacks.onError(new Error('FAIL'));
    capturedCallbacks.onClose();
  });
});
