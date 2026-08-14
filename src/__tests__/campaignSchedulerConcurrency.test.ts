import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';
import {
  processScheduledCampaign,
  sweepStaleCallingContacts,
  type SchedulableCampaign,
} from '../services/campaignScheduler.js';
import { extractVobizCredentials } from '../services/vobizCalling.js';
import { runCampaign } from '../services/campaignRunner.js';
import {
  CAMPAIGN_STATUS,
  CAMPAIGN_CONTACT_STATUS,
  CAMPAIGN_SCHEDULER,
  TELEPHONY_LIMITS,
} from '../types/index.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaign: { findMany: vi.fn(), update: vi.fn() },
    campaignContact: { findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalance: 100, costPerMinute: 7 }),
    },
    telephonyProvider: { findFirst: vi.fn() },
  },
}));

vi.mock('../services/vobizCalling.js', () => ({
  extractVobizCredentials: vi.fn(),
}));

vi.mock('../services/campaignRunner.js', () => ({
  runCampaign: vi.fn(),
}));

const runningCampaign = (overrides: Partial<SchedulableCampaign> = {}): SchedulableCampaign => ({
  id: 'camp-1',
  agentId: 'agent-1',
  providerId: 'prov-1',
  userId: 'user-1',
  status: CAMPAIGN_STATUS.RUNNING,
  scheduledAt: null,
  windowStart: null,
  windowEnd: null,
  timezone: null,
  ...overrides,
});

const NOW = new Date('2026-07-07T10:00:00Z');

/** Pending contacts waiting to be dialled, and calls already ringing. */
const stubContactCounts = (pending: number, calling = 0): void => {
  (prisma.campaignContact.count as any).mockImplementation(({ where }: any) =>
    Promise.resolve(where.status === CAMPAIGN_CONTACT_STATUS.CALLING ? calling : pending));
};

const stubProvider = (concurrencyLimit?: number): void => {
  (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'prov-1', concurrencyLimit });
  (extractVobizCredentials as any).mockReturnValue({ authId: 'a', authToken: 't', fromNumber: '+9' });
  (runCampaign as any).mockResolvedValue({ total: 1, initiated: 1, failed: 0, queued: 0 });
};

describe('scheduler respects the provider concurrency limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.campaignContact.findMany as any).mockResolvedValue([{ id: 'c1', phoneNumber: '+1' }]);
  });

  it('dials only the channels the provider has free', async () => {
    stubContactCounts(10, 2);
    stubProvider(3);

    await processScheduledCampaign(runningCampaign(), NOW);

    // A limit of 3 minus 2 live calls leaves a single free channel.
    expect(prisma.campaignContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
    expect(runCampaign).toHaveBeenCalledWith(expect.objectContaining({ concurrency: 1 }));
  });

  it('places no calls while the provider is saturated', async () => {
    stubContactCounts(10, 3);
    stubProvider(3);

    await processScheduledCampaign(runningCampaign(), NOW);

    expect(prisma.campaignContact.findMany).not.toHaveBeenCalled();
    expect(runCampaign).not.toHaveBeenCalled();
  });

  it('caps a batch at the tick batch size when the limit is larger', async () => {
    stubContactCounts(500, 0);
    stubProvider(TELEPHONY_LIMITS.MAX_CONCURRENCY);

    await processScheduledCampaign(runningCampaign(), NOW);

    expect(prisma.campaignContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: CAMPAIGN_SCHEDULER.BATCH_SIZE }),
    );
  });

  it('falls back to the default limit for a provider without one stored', async () => {
    stubContactCounts(10, 0);
    stubProvider(undefined);

    await processScheduledCampaign(runningCampaign(), NOW);

    expect(runCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: TELEPHONY_LIMITS.DEFAULT_CONCURRENCY }),
    );
  });

  it('skips the dial when another tick already took the last pending contacts', async () => {
    stubContactCounts(10, 0);
    stubProvider(3);
    (prisma.campaignContact.findMany as any).mockResolvedValue([]);

    await processScheduledCampaign(runningCampaign(), NOW);

    expect(runCampaign).not.toHaveBeenCalled();
  });

  it('passes a hangup url builder so unanswered calls get a final status', async () => {
    stubContactCounts(1, 0);
    stubProvider(3);

    await processScheduledCampaign(runningCampaign(), NOW);

    const params = (runCampaign as any).mock.calls[0][0];
    expect(params.hangupUrlBuilder('agent-1', 'c1')).toContain('/api/webhooks/vobiz/hangup');
  });
});

describe('sweepStaleCallingContacts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('writes off contacts left ringing past the timeout', async () => {
    (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 2 });

    const count = await sweepStaleCallingContacts(NOW);

    expect(count).toBe(2);
    const call = (prisma.campaignContact.updateMany as any).mock.calls[0][0];
    expect(call.where.status).toBe(CAMPAIGN_CONTACT_STATUS.CALLING);
    expect(call.where.updatedAt.lt.getTime())
      .toBe(NOW.getTime() - CAMPAIGN_SCHEDULER.CALLING_TIMEOUT_MS);
    expect(call.data.status).toBe(CAMPAIGN_CONTACT_STATUS.FAILED);
    expect(call.data.errorMessage).toBeTruthy();
  });

  it('is quiet when nothing is stuck', async () => {
    (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 0 });
    await expect(sweepStaleCallingContacts(NOW)).resolves.toBe(0);
  });
});
