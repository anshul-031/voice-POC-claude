import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';
import { runCampaign } from '../services/campaignRunner.js';
import { resolveConcurrency } from '../utils/concurrency.js';
import { initiateVobizCall } from '../services/vobizCalling.js';
import { CAMPAIGN_CONTACT_STATUS, TELEPHONY_LIMITS } from '../types/index.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaignContact: { update: vi.fn() },
  },
}));

vi.mock('../services/vobizCalling.js', () => ({
  initiateVobizCall: vi.fn(),
}));

const creds = { authId: 'id', authToken: 'tok', fromNumber: '+1999' };
const answerUrlBuilder = (agentId: string, contactId: string): string =>
  `https://x/api/webhooks/vobiz/answer?agentId=${agentId}&contactId=${contactId}`;

describe('runCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initiates calls and marks contacts as calling on success', async () => {
    (initiateVobizCall as any).mockResolvedValue({ success: true, callId: 'call-1' });

    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: [
        { id: 'c1', phoneNumber: '+111' },
        { id: 'c2', phoneNumber: '+222' },
      ],
      creds,
      answerUrlBuilder,
    });

    expect(summary).toEqual({ total: 2, initiated: 2, failed: 0, queued: 0 });
    expect(initiateVobizCall).toHaveBeenCalledTimes(2);
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: CAMPAIGN_CONTACT_STATUS.CALLING, callId: 'call-1', errorMessage: null },
    });
  });

  it('marks a contact failed when the provider reports failure', async () => {
    (initiateVobizCall as any).mockResolvedValue({ success: false, errorMessage: 'rejected' });

    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: [{ id: 'c1', phoneNumber: '+111' }],
      creds,
      answerUrlBuilder,
    });

    expect(summary).toEqual({ total: 1, initiated: 0, failed: 1, queued: 0 });
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: 'rejected' },
    });
  });

  it('uses a fallback callId/message when fields are missing', async () => {
    (initiateVobizCall as any)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: [
        { id: 'c1', phoneNumber: '+111' },
        { id: 'c2', phoneNumber: '+222' },
      ],
      creds,
      answerUrlBuilder,
    });

    expect(summary).toEqual({ total: 2, initiated: 1, failed: 1, queued: 0 });
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: CAMPAIGN_CONTACT_STATUS.CALLING, callId: null, errorMessage: null },
    });
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'c2' },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: 'Call failed' },
    });
  });

  it('catches thrown errors and marks the contact failed', async () => {
    (initiateVobizCall as any).mockRejectedValue(new Error('network down'));

    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: [{ id: 'c1', phoneNumber: '+111' }],
      creds,
      answerUrlBuilder,
    });

    expect(summary).toEqual({ total: 1, initiated: 0, failed: 1, queued: 0 });
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: 'network down' },
    });
  });

  it('handles non-Error throws', async () => {
    (initiateVobizCall as any).mockRejectedValue('boom');

    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: [{ id: 'c1', phoneNumber: '+111' }],
      creds,
      answerUrlBuilder,
    });

    expect(summary.failed).toBe(1);
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: 'boom' },
    });
  });
});

describe('resolveConcurrency', () => {
  it('defaults when no limit is stored on the provider', () => {
    expect(resolveConcurrency(undefined)).toBe(TELEPHONY_LIMITS.DEFAULT_CONCURRENCY);
    expect(resolveConcurrency(null)).toBe(TELEPHONY_LIMITS.DEFAULT_CONCURRENCY);
    expect(resolveConcurrency(Number.NaN)).toBe(TELEPHONY_LIMITS.DEFAULT_CONCURRENCY);
  });

  it('clamps to the supported range', () => {
    expect(resolveConcurrency(0)).toBe(TELEPHONY_LIMITS.MIN_CONCURRENCY);
    expect(resolveConcurrency(-5)).toBe(TELEPHONY_LIMITS.MIN_CONCURRENCY);
    expect(resolveConcurrency(10_000)).toBe(TELEPHONY_LIMITS.MAX_CONCURRENCY);
    expect(resolveConcurrency(7.9)).toBe(7);
  });
});

describe('runCampaign concurrency limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (initiateVobizCall as any).mockResolvedValue({ success: true, callId: 'call-1' });
  });

  const fiveContacts = [
    { id: 'c1', phoneNumber: '+1' },
    { id: 'c2', phoneNumber: '+2' },
    { id: 'c3', phoneNumber: '+3' },
    { id: 'c4', phoneNumber: '+4' },
    { id: 'c5', phoneNumber: '+5' },
  ];

  it('dials only up to the limit and queues the rest', async () => {
    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: fiveContacts,
      creds,
      concurrency: 2,
      answerUrlBuilder,
    });

    expect(summary).toEqual({ total: 2, initiated: 2, failed: 0, queued: 3 });
    expect(initiateVobizCall).toHaveBeenCalledTimes(2);
    // The queued contacts must be left untouched so the scheduler can pick them
    // up; marking them would lose numbers that were never really attempted.
    expect(prisma.campaignContact.update).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default limit when none is supplied', async () => {
    const summary = await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: fiveContacts,
      creds,
      answerUrlBuilder,
    });

    expect(initiateVobizCall).toHaveBeenCalledTimes(TELEPHONY_LIMITS.DEFAULT_CONCURRENCY);
    expect(summary.queued).toBe(fiveContacts.length - TELEPHONY_LIMITS.DEFAULT_CONCURRENCY);
  });

  it('passes a hangup url so unanswered calls can be resolved', async () => {
    await runCampaign({
      campaignId: 'camp-1',
      agentId: 'agent-1',
      contacts: [{ id: 'c1', phoneNumber: '+111' }],
      creds,
      answerUrlBuilder,
      hangupUrlBuilder: (agentId, contactId) =>
        `https://x/api/webhooks/vobiz/hangup?agentId=${agentId}&contactId=${contactId}`,
    });

    expect(initiateVobizCall).toHaveBeenCalledWith(
      creds,
      '+111',
      expect.stringContaining('/answer?'),
      expect.stringContaining('/hangup?agentId=agent-1&contactId=c1'),
    );
  });
});
