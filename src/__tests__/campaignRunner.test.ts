import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';
import { runCampaign } from '../services/campaignRunner.js';
import { initiateVobizCall } from '../services/vobizCalling.js';
import { CAMPAIGN_CONTACT_STATUS } from '../types/index.js';

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

    expect(summary).toEqual({ total: 2, initiated: 2, failed: 0 });
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

    expect(summary).toEqual({ total: 1, initiated: 0, failed: 1 });
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

    expect(summary).toEqual({ total: 2, initiated: 1, failed: 1 });
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

    expect(summary).toEqual({ total: 1, initiated: 0, failed: 1 });
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
