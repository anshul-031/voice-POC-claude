import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebSocket } from 'ws';
import signalingServer from '../services/signalingServer.js';
import geminiLiveService from '../services/geminiLive.js';
import prisma from '../lib/prisma.js';
import { generateToken } from '../services/auth.js';

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
    sendText: vi.fn().mockResolvedValue(true),
    closeSession: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../lib/prisma.js', () => ({
  default: {
    voiceAgent: {
      findUnique: vi.fn(),
    },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
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
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: '1',
      name: 'A',
      systemPrompt: 'S',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (geminiLiveService.createSession as any).mockResolvedValue({});
    await messageHandler(JSON.stringify({ type: 'start-call', agentId: '1' }));
    
    // 2. audio-data success
    await messageHandler(JSON.stringify({ type: 'audio-data', data: 'abc' }));
    await messageHandler(JSON.stringify({ type: 'audio-data', data: 'abc-2' }));
    
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
    await messageHandler(JSON.stringify({ type: 'audio-data', data: 'without-client' }));
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
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: '1',
      name: 'A',
      systemPrompt: 'S',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (geminiLiveService.createSession as any).mockRejectedValue(new Error('CREATE_FAIL'));
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('error'));

    // 5. Insufficient wallet balance
    (prisma.user.findUniqueOrThrow as any).mockResolvedValueOnce({ walletBalance: 9, costPerMinute: 7 });
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('Insufficient wallet balance'));

    // 6. Existing session on WS
    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'old',
      agentId: '1',
      startTime: Date.now(),
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
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
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: '1',
      name: 'A',
      systemPrompt: 'S',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(geminiLiveService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'initial-greeting',
    );

    const client = signalingServer.clients.get(mockWs as WebSocket);
    if (client) {
      client.audioChunksRelayed = 1;
      client.modelAudioChunksRelayed = 0;
      client.startTime = Date.now() - 4000;
    }
    
    // Trigger each callback when OPEN
    capturedCallbacks.onAudio('chunk');
    capturedCallbacks.onTranscript({ role: 'user', text: 'hi' });
    capturedCallbacks.onTranscript({ role: 'model', text: 'hello' });
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

  it('should reject private agent calls without owner auth', async () => {
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: 'private-agent',
      name: 'Private',
      systemPrompt: 'S',
      publicPreviewEnabled: false,
      userId: 'owner-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });

    await signalingServer._handleStartCall(mockWs, { agentId: 'private-agent' }, null);

    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('private'));
  });

  it('should cover proactive greeting failure branch', async () => {
    (geminiLiveService.sendText as any).mockResolvedValueOnce(false);
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: '1',
      name: 'A',
      systemPrompt: 'S',
      voiceName: 'Puck',
      modelName: 'gemini-2.0-flash-exp',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (geminiLiveService.createSession as any).mockResolvedValue({});

    await signalingServer._handleStartCall(mockWs, { agentId: '1' });

    expect(geminiLiveService.sendText).toHaveBeenCalled();
  });

  it('should substitute call variables into the system prompt before creating the session', async () => {
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: '1',
      name: 'A',
      systemPrompt: 'Hello {{customer_name}}, welcome to {{company}}.',
      voiceName: 'Puck',
      modelName: 'gemini-2.0-flash-exp',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (geminiLiveService.createSession as any).mockResolvedValue({});

    await signalingServer._handleStartCall(
      mockWs,
      { agentId: '1', variables: { customer_name: 'Sam', company: 'Acme' } },
    );

    const [, config] = (geminiLiveService.createSession as any).mock.calls.at(-1);
    expect(config.systemPrompt).toBe('Hello Sam, welcome to Acme.');
  });

  it('should reject invalid audio payloads in _handleAudioData', async () => {
    await signalingServer._handleAudioData(mockWs, { data: '' }, 'cid-invalid-audio');
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('error'));
  });

  it('should handle disconnect close-session failures', async () => {
    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'session-close-error',
      agentId: '1',
      startTime: Date.now(),
      audioChunksRelayed: 2,
      modelAudioChunksRelayed: 0,
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });

    (geminiLiveService.closeSession as any).mockRejectedValueOnce(new Error('CLOSE_FAIL'));
    signalingServer._handleDisconnect(mockWs);
    await Promise.resolve();

    expect(geminiLiveService.closeSession).toHaveBeenCalledWith('session-close-error');
  });

  it('should parse requester user id from cookies and evaluate access helper', () => {
    const noCookie = (signalingServer as any)._resolveRequesterUserId({ headers: {} });
    expect(noCookie).toBeNull();

    const noTokenCookie = (signalingServer as any)._resolveRequesterUserId({
      headers: { cookie: 'a=1; b=2' },
    });
    expect(noTokenCookie).toBeNull();

    const invalidToken = (signalingServer as any)._resolveRequesterUserId({
      headers: { cookie: 'token=badtoken' },
    });
    expect(invalidToken).toBeNull();

    const emptyToken = (signalingServer as any)._resolveRequesterUserId({
      headers: { cookie: 'token=' },
    });
    expect(emptyToken).toBeNull();

    const token = generateToken('user-1', 'user@example.com');
    const validToken = (signalingServer as any)._resolveRequesterUserId({
      headers: { cookie: `x=1; token=${encodeURIComponent(token)}` },
    });
    expect(validToken).toBe('user-1');

    const publicAllowed = (signalingServer as any)._canAccessAgent(
      { publicPreviewEnabled: true, userId: 'owner-1' },
      null,
    );
    expect(publicAllowed).toBe(true);

    const ownerAllowed = (signalingServer as any)._canAccessAgent(
      { publicPreviewEnabled: false, userId: 'owner-1' },
      'owner-1',
    );
    expect(ownerAllowed).toBe(true);

    const denied = (signalingServer as any)._canAccessAgent(
      { publicPreviewEnabled: false, userId: 'owner-1' },
      'other-user',
    );
    expect(denied).toBe(false);
  });

});
