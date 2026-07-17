/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { LIVE_CALL } from '../types/index.js';
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
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
    },
    campaignContact: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../utils/audioResampler.js', () => ({
  upsample8To16: vi.fn((input) => input),
  downsample24To8: vi.fn((input) => input),
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
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
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
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
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
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
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
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (signalingServer as any)._relayTranscriptToClient(
      mockWs,
      'model-with-user',
      { role: 'model', text: 'm2' },
      'cid-model-2',
    );
  });

  it('covers inactivity monitor and auto-end branches', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const now = Date.now();

    (geminiLiveService.sendText as any).mockResolvedValue(undefined);
    (geminiLiveService.closeSession as any).mockResolvedValue(undefined);

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid-inactivity',
      agentId: '1',
      correlationId: 'cid-inactivity',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: now - 5000,
      proactiveGreetingSent: false,
      lastModelResponseAt: now - 5000,
      lastUserAudioAt: now - 4000,
      nudgeCount: 0,
      inactivityTimeoutMs: 1000,
      maxInactivityNudges: 1,
      maxCallDurationSecs: 0,
    });

    (signalingServer as any)._startInactivityMonitor(mockWs, 'sid-inactivity', 'cid-inactivity');
    vi.advanceTimersByTime(LIVE_CALL.INACTIVITY_CHECK_INTERVAL_MS * 3);
    await Promise.resolve();
    await Promise.resolve();

    expect(geminiLiveService.sendText).toHaveBeenCalled();
    expect(geminiLiveService.closeSession).toHaveBeenCalledWith('sid-inactivity');
    expect(clearIntervalSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('covers inactivity monitor session mismatch cleanup', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid-mismatch',
      agentId: '1',
      correlationId: 'cid-mismatch',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 1000,
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now() - 1000,
      lastUserAudioAt: Date.now() - 500,
      nudgeCount: 0,
      inactivityTimeoutMs: 1000,
      maxInactivityNudges: 1,
      maxCallDurationSecs: 0,
    });

    (signalingServer as any)._startInactivityMonitor(mockWs, 'sid-mismatch', 'cid-mismatch');
    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid-other',
      agentId: '1',
      correlationId: 'cid-mismatch',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 1000,
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now() - 1000,
      lastUserAudioAt: Date.now() - 500,
      nudgeCount: 0,
      inactivityTimeoutMs: 1000,
      maxInactivityNudges: 1,
      maxCallDurationSecs: 0,
    });

    vi.advanceTimersByTime(LIVE_CALL.INACTIVITY_CHECK_INTERVAL_MS);
    expect(clearIntervalSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('covers call duration timer and auto-end cleanup branches', async () => {
    vi.useFakeTimers();
    (geminiLiveService.closeSession as any).mockResolvedValue(undefined);

    const inactivityTimer = setInterval(() => {}, 1000);

    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid-duration',
      agentId: '1',
      correlationId: 'cid-duration',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: Date.now() - 2000,
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now() - 2000,
      lastUserAudioAt: Date.now() - 1500,
      nudgeCount: 0,
      inactivityTimeoutMs: 1000,
      maxInactivityNudges: 1,
      maxCallDurationSecs: 1,
      inactivityTimer,
    });

    (signalingServer as any)._startCallDurationTimer(mockWs, 'sid-duration', 'cid-duration');
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(geminiLiveService.closeSession).toHaveBeenCalledWith('sid-duration');
    expect(signalingServer.clients.has(mockWs as WebSocket)).toBe(false);
    vi.useRealTimers();
  });

  it('covers auto-end no-client branch', async () => {
    const closeCallsBefore = (geminiLiveService.closeSession as any).mock.calls.length;
    await (signalingServer as any)._autoEndCall(mockWs, 'missing-session', 'cid-missing', 'reason');
    expect((geminiLiveService.closeSession as any).mock.calls.length).toBe(closeCallsBefore);
  });

  it('covers non-Error createSession failure branch', async () => {
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

  it('covers _extractAgentIdFromUrl', () => {
    const extract = (signalingServer as any)._extractAgentIdFromUrl.bind(signalingServer);

    const withAgent = extract({
      headers: { host: 'example.com' },
      url: '/ws?agentId=agent-123',
    });
    expect(withAgent).toBe('agent-123');

    const withoutAgent = extract({
      headers: { host: 'example.com' },
      url: '/ws',
    });
    expect(withoutAgent).toBeNull();

    const emptyUrl = extract({
      headers: { host: 'example.com' },
      url: '',
    });
    expect(emptyUrl).toBeNull();
  });

  it('covers _handleVobizStreamEvent for all event types', async () => {
    const req = {
      headers: { host: 'example.com' },
      url: '/ws?agentId=agent-v1',
    };

    // 'start' event — mocks the start call flow
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: 'agent-v1',
      name: 'Vobiz Agent',
      systemPrompt: 'Hello',
      voiceName: 'Puck',
      modelName: 'gemini-2.0-flash-exp',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (geminiLiveService.createSession as any).mockResolvedValue(undefined);

    await (signalingServer as any)._handleVobizStreamEvent(
      mockWs,
      { event: 'start', streamId: 's1' },
      req,
      'cid-vobiz',
    );

    // 'media' event — needs a registered client
    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid-vobiz',
      agentId: 'agent-v1',
      correlationId: 'cid-vobiz',
      audioChunksRelayed: 0,
      modelAudioChunksRelayed: 0,
      startTime: Date.now(),
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });

    await (signalingServer as any)._handleVobizStreamEvent(
      mockWs,
      { event: 'media', streamId: 's1', media: { payload: 'base64audio' } },
      req,
      'cid-vobiz',
    );
    expect(geminiLiveService.sendAudio).toHaveBeenCalledWith('sid-vobiz', 'base64audio');

    // 'stop' event
    await (signalingServer as any)._handleVobizStreamEvent(
      mockWs,
      { event: 'stop', streamId: 's1' },
      req,
      'cid-vobiz',
    );

    // unknown event
    await (signalingServer as any)._handleVobizStreamEvent(
      mockWs,
      { event: 'checkpoint', streamId: 's1' },
      req,
      'cid-vobiz',
    );
  });

  it('covers _handleVobizStart with missing agentId', async () => {
    const req = {
      headers: { host: 'example.com' },
      url: '/ws',
    };

    await (signalingServer as any)._handleVobizStart(mockWs, 'stream-no-agent', req, 'cid');
    // Should not crash — just log error and return
  });

  it('loads campaign contact variables for a campaign call', async () => {
    const req = {
      headers: { host: 'example.com' },
      url: '/ws?agentId=agent-v1&contactId=ct-1',
    };
    (prisma.voiceAgent.findUnique as any).mockResolvedValue({
      id: 'agent-v1',
      name: 'Vobiz Agent',
      systemPrompt: 'Hello {{name}}',
      voiceName: 'Puck',
      modelName: 'gemini-2.0-flash-exp',
      publicPreviewEnabled: true,
      userId: 'user-1',
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });
    (prisma.campaignContact.findUnique as any).mockResolvedValue({
      id: 'ct-1',
      variables: { name: 'Sam', age: 30 },
    });
    (prisma.campaignContact.update as any).mockResolvedValue({});
    (geminiLiveService.createSession as any).mockResolvedValue(undefined);

    await (signalingServer as any)._handleVobizStart(mockWs, 's1', req, 'cid-campaign');

    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'ct-1' },
      data: { status: 'completed' },
    });
    const [, config] = (geminiLiveService.createSession as any).mock.calls.at(-1);
    expect(config.systemPrompt).toBe('Hello Sam');
  });

  it('handles a missing campaign contact gracefully', async () => {
    (prisma.campaignContact.findUnique as any).mockResolvedValue(null);
    const variables = await (signalingServer as any)._loadCampaignContactVariables('missing', 'cid');
    expect(variables).toBeUndefined();
  });

  it('returns undefined when contact variables are not an object', async () => {
    (prisma.campaignContact.findUnique as any).mockResolvedValue({ id: 'ct-2', variables: null });
    (prisma.campaignContact.update as any).mockResolvedValue({});
    const variables = await (signalingServer as any)._loadCampaignContactVariables('ct-2', 'cid');
    expect(variables).toBeUndefined();
  });

  it('swallows errors while loading campaign contact variables', async () => {
    (prisma.campaignContact.findUnique as any).mockRejectedValue(new Error('DB down'));
    const variables = await (signalingServer as any)._loadCampaignContactVariables('ct-3', 'cid');
    expect(variables).toBeUndefined();
  });

  it('covers _handleVobizMedia with missing payload', async () => {
    await (signalingServer as any)._handleVobizMedia(
      mockWs,
      { media: {} },
      'cid-no-payload',
    );
    // Should not crash — early return
  });

  it('covers _handleVobizMedia with no client', async () => {
    signalingServer.clients.clear();
    await (signalingServer as any)._handleVobizMedia(
      mockWs,
      { media: { payload: 'audio' } },
      'cid-no-client',
    );
    // Should not crash — early return
  });

  it('covers _sendVobizPlayAudio', () => {
    mockWs.readyState = 1;
    const mockClient = { streamId: 's1' } as any;
    (signalingServer as any)._sendVobizPlayAudio(mockWs, mockClient, 'audio-data');
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ 
        event: 'playAudio', 
        media: { 
          contentType: 'audio/x-l16',
          sampleRate: 8000,
          payload: 'audio-data' 
        } 
      }),
    );

    // With closed socket
    mockWs.readyState = 3;
    mockWs.send.mockClear();
    (signalingServer as any)._sendVobizPlayAudio(mockWs, mockClient, 'audio-data');
    expect(mockWs.send).not.toHaveBeenCalled();

    // With send throwing
    mockWs.readyState = 1;
    mockWs.send.mockImplementationOnce(() => { throw new Error('closed'); });
    (signalingServer as any)._sendVobizPlayAudio(mockWs, mockClient, 'audio-data');
    // Should not throw
    
    // With missing streamId
    mockWs.readyState = 1;
    mockWs.send.mockClear();
    (signalingServer as any)._sendVobizPlayAudio(mockWs, {} as any, 'audio-data');
    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it('covers Vobiz media chunk logging at intervals', async () => {
    signalingServer.clients.set(mockWs as WebSocket, {
      sessionId: 'sid-chunks',
      agentId: '1',
      correlationId: 'cid-chunks',
      audioChunksRelayed: 49,
      modelAudioChunksRelayed: 0,
      startTime: Date.now(),
      proactiveGreetingSent: false,
      lastModelResponseAt: Date.now(),
      lastUserAudioAt: Date.now(),
      nudgeCount: 0,
      inactivityTimeoutMs: 10000,
      maxInactivityNudges: 3,
      maxCallDurationSecs: 0,
    });

    await (signalingServer as any)._handleVobizMedia(
      mockWs,
      { media: { payload: 'chunk50' } },
      'cid-chunks',
    );
    // 49 + 1 = 50, which triggers the modulo 50 logging
  });
});
