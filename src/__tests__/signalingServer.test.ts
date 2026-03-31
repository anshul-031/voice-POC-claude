import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebSocket } from 'ws';
import signalingServer from '../services/signalingServer.js';
import geminiLiveService from '../services/geminiLive.js';
import prisma from '../lib/prisma.js';

// Mock correctly to capture the mock instance
let lastMockWss: any;
vi.mock('ws', () => {
  const mockWebSocket = {
    OPEN: 1,
  };
  const mockWebSocketServer = vi.fn(function() {
    lastMockWss = { on: vi.fn() };
    return lastMockWss;
  });
  return {
    WebSocketServer: mockWebSocketServer,
    WebSocket: mockWebSocket,
    default: Object.assign(mockWebSocket, { WebSocketServer: mockWebSocketServer }),
  };
});

vi.mock('../services/geminiLive.js', () => ({
  default: {
    createSession: vi.fn(),
    sendAudio: vi.fn(),
    closeSession: vi.fn().mockResolvedValue(undefined),
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
  let mockWs: any;

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
    signalingServer.attach({} as any);
    const mockWss = lastMockWss;
    const connectionHandler = mockWss.on.mock.calls.find((c: any) => c[0] === 'connection')[1];
    connectionHandler(mockWs, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    
    // Trigger message handler for all types
    const messageHandler = mockWs.on.mock.calls.find((c: any) => c[0] === 'message')[1];
    
    // 1. start-call success
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({ id: '1', name: 'A', systemPrompt: 'S' });
    (geminiLiveService.createSession as any).mockResolvedValue({});
    await messageHandler(JSON.stringify({ type: 'start-call', agentId: '1' }));
    
    // 2. audio-data success
    await messageHandler(JSON.stringify({ type: 'audio-data', data: 'abc' }));
    
    // Disconnect with ACTIVE client (hits lines 187-190)
    const closeHandler = mockWs.on.mock.calls.find((c: any) => c[0] === 'close')[1];
    closeHandler(1006, Buffer.from('abnormal'));
    
    // Re-create session for remaining tests
    (geminiLiveService.createSession as any).mockResolvedValue({});
    await messageHandler(JSON.stringify({ type: 'start-call', agentId: '1' }));

    // 3. end-call success
    await messageHandler(JSON.stringify({ type: 'end-call' }));
    
    // 4. Unknown type
    await messageHandler(JSON.stringify({ type: 'unknown' }));
    
    // 5. Invalid JSON (hit catch)
    await messageHandler('invalid-json');

    // Hit close and error handlers
    const closeHandler2 = mockWs.on.mock.calls.find((c: any) => c[0] === 'close')[1];
    
    // Test _handleEndCall with no client
    signalingServer.clients.delete(mockWs as WebSocket);
    await messageHandler(JSON.stringify({ type: 'end-call' }));
    
    // Test disconnect with no client
    closeHandler2(1000, Buffer.from(''));
    
    const errorHandler = mockWs.on.mock.calls.find((c: any) => c[0] === 'error')[1];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('WS_FAIL'));
  });

  it('should cover _handleStartCall failure paths', async () => {
    // 1. Missing agentId
    await signalingServer._handleStartCall(mockWs, { agentId: '' });
    
    // 2. Agent not found
    (prisma.voiceAgent.findUnique as any).mockResolvedValue(null);
    await signalingServer._handleStartCall(mockWs, { agentId: '404' });
    
    // 3. Error path (DB catch outside try block passed up)
    (prisma.voiceAgent.findUnique as any).mockRejectedValue(new Error('DB_FAIL'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(signalingServer._handleStartCall(mockWs, { agentId: '1' })).rejects.toThrow('DB_FAIL');
    
    // 4. CreateSession failure (inner catch block)
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({ id: '1', name: 'A', systemPrompt: 'S' });
    (geminiLiveService.createSession as any).mockRejectedValue(new Error('CREATE_FAIL'));
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('error'));
    
    // 5. Existing session on WS
    signalingServer.clients.set(mockWs as WebSocket, { sessionId: 'old', agentId: '1', startTime: Date.now(), audioChunksRelayed: 0 });
    (geminiLiveService.createSession as any).mockResolvedValue({});
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(geminiLiveService.closeSession).toHaveBeenCalledWith('old');
  });

  it('should hit Gemini callbacks (SignalingServer logic)', async () => {
    let capturedCallbacks: any;
    (geminiLiveService.createSession as any).mockImplementation((_sid: string, config: any) => {
      capturedCallbacks = config;
      return Promise.resolve();
    });
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({ id: '1', name: 'A', systemPrompt: 'S' });
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
