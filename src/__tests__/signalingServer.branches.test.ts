import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import signalingServer from '../services/signalingServer.js';
import geminiLiveService from '../services/geminiLive.js';
import prisma from '../lib/prisma.js';

let lastMockWss: any;
vi.mock('ws', () => {
  const mockWebSocket = { OPEN: 1 };
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
  },
}));

describe('SignalingServer branch helpers', () => {
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

  it('covers _relayModelAudioToClient branches', () => {
    mockWs.readyState = 1;

    (signalingServer as any)._relayModelAudioToClient(mockWs, 'sid', 'audio-a');

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid',
      agentId: '1',
      correlationId: 'cid',
      audioChunksRelayed: 10,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 4000,
      proactiveGreetingSent: false,
    });
    (signalingServer as any)._relayModelAudioToClient(mockWs, 'sid', 'audio-b');

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid2',
      agentId: '1',
      correlationId: 'cid2',
      audioChunksRelayed: 2,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 1200,
      firstUserTranscriptRelayedAt: Date.now() - 300,
      proactiveGreetingSent: true,
      proactiveGreetingSentAt: Date.now() - 200,
    });
    (signalingServer as any)._relayModelAudioToClient(mockWs, 'sid2', 'audio-c');
    (signalingServer as any)._relayModelAudioToClient(mockWs, 'sid2', 'audio-d');
  });

  it('covers _relayTranscriptToClient model transcript branches', () => {
    mockWs.readyState = 1;

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'model-no-user',
      agentId: '1',
      correlationId: 'cid-model-1',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 100,
      proactiveGreetingSent: false,
    });
    (signalingServer as any)._relayTranscriptToClient(
      mockWs,
      'model-no-user',
      { role: 'model', text: 'm1' },
      'cid-model-1',
    );

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'model-with-user',
      agentId: '1',
      correlationId: 'cid-model-2',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 100,
      firstUserTranscriptRelayedAt: Date.now() - 50,
      proactiveGreetingSent: true,
      proactiveGreetingSentAt: Date.now() - 70,
    });
    (signalingServer as any)._relayTranscriptToClient(
      mockWs,
      'model-with-user',
      { role: 'model', text: 'm2' },
      'cid-model-2',
    );
  });

  it('covers non-Error createSession failure branch', async () => {
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: '1',
      name: 'A',
      systemPrompt: 'S',
      voiceName: 'Puck',
      modelName: 'gemini-2.0-flash-exp',
      publicPreviewEnabled: true,
      userId: null,
    });
    (geminiLiveService.createSession as any).mockRejectedValueOnce('RAW_CREATE_FAIL');

    await signalingServer._handleStartCall(mockWs, { agentId: '1' });
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('error'));
  });

  it('covers non-Error message handling catch branch', async () => {
    signalingServer.attach({} as any);
    const mockWss = lastMockWss;
    const connectionHandler = mockWss.on.mock.calls.find((c: any) => c[0] === 'connection')[1];
    connectionHandler(mockWs, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });

    vi.spyOn(signalingServer as any, '_handleMessage').mockRejectedValueOnce('RAW_MESSAGE_FAIL');

    const messageHandler = mockWs.on.mock.calls.find((c: any) => c[0] === 'message')[1];
    await messageHandler(JSON.stringify({ type: 'end-call' }));

    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('RAW_MESSAGE_FAIL'));
  });
});
