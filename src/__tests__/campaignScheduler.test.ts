import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import prisma from '../lib/prisma.js';
import {
  parseTimeOfDay,
  isWithinCallWindow,
  resolvePublicBaseUrl,
  buildSchedulerAnswerUrl,
  processScheduledCampaign,
  runSchedulerTick,
  startCampaignScheduler,
  stopCampaignScheduler,
  type SchedulableCampaign,
} from '../services/campaignScheduler.js';
import { extractVobizCredentials } from '../services/vobizCalling.js';
import { runCampaign } from '../services/campaignRunner.js';
import { CAMPAIGN_STATUS } from '../types/index.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaign: { findMany: vi.fn(), update: vi.fn() },
    campaignContact: { findMany: vi.fn(), updateMany: vi.fn() },
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

const baseCampaign = (overrides: Partial<SchedulableCampaign> = {}): SchedulableCampaign => ({
  id: 'camp-1',
  agentId: 'agent-1',
  providerId: 'prov-1',
  userId: 'user-1',
  status: CAMPAIGN_STATUS.SCHEDULED,
  scheduledAt: null,
  windowStart: null,
  windowEnd: null,
  timezone: null,
  ...overrides,
});

const IST = 'Asia/Kolkata';

describe('campaignScheduler pure helpers', () => {
  it('parses time-of-day into minutes', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('09:30')).toBe(570);
    expect(parseTimeOfDay('23:59')).toBe(1439);
  });

  it('treats a missing window as always open', () => {
    const now = new Date('2026-07-07T03:00:00Z');
    expect(isWithinCallWindow(now)).toBe(true);
    expect(isWithinCallWindow(now, '09:00', null)).toBe(true);
  });

  it('respects a normal (same-day) window', () => {
    expect(isWithinCallWindow(new Date('2026-07-07T10:00:00Z'), '09:00', '18:00', 'UTC')).toBe(true);
    expect(isWithinCallWindow(new Date('2026-07-07T08:00:00Z'), '09:00', '18:00', 'UTC')).toBe(false);
    expect(isWithinCallWindow(new Date('2026-07-07T18:00:00Z'), '09:00', '18:00', 'UTC')).toBe(false);
  });

  it('respects an overnight window', () => {
    expect(isWithinCallWindow(new Date('2026-07-07T23:00:00Z'), '22:00', '06:00', 'UTC')).toBe(true);
    expect(isWithinCallWindow(new Date('2026-07-07T03:00:00Z'), '22:00', '06:00', 'UTC')).toBe(true);
    expect(isWithinCallWindow(new Date('2026-07-07T12:00:00Z'), '22:00', '06:00', 'UTC')).toBe(false);
  });

  it('evaluates the window in the campaign timezone, not the server timezone', () => {
    // 12:30 UTC is 18:00 IST. An 18:00-21:00 window entered by an IST user must
    // be open at that instant, and closed at 18:00 UTC (23:30 IST).
    expect(isWithinCallWindow(new Date('2026-07-07T12:30:00Z'), '18:00', '21:00', IST)).toBe(true);
    expect(isWithinCallWindow(new Date('2026-07-07T18:00:00Z'), '18:00', '21:00', IST)).toBe(false);

    // The same instants read in UTC give the opposite answers — this inversion
    // is what delayed IST campaigns by 5h30m.
    expect(isWithinCallWindow(new Date('2026-07-07T12:30:00Z'), '18:00', '21:00', 'UTC')).toBe(false);
    expect(isWithinCallWindow(new Date('2026-07-07T18:00:00Z'), '18:00', '21:00', 'UTC')).toBe(true);
  });

  it('handles an overnight window across a zone offset', () => {
    // 22:00-06:00 IST => 16:30-00:30 UTC.
    expect(isWithinCallWindow(new Date('2026-07-07T17:00:00Z'), '22:00', '06:00', IST)).toBe(true);
    expect(isWithinCallWindow(new Date('2026-07-07T10:00:00Z'), '22:00', '06:00', IST)).toBe(false);
  });

  it('falls back to UTC when the campaign has no timezone', () => {
    expect(isWithinCallWindow(new Date('2026-07-07T10:00:00Z'), '09:00', '18:00', null)).toBe(true);
    expect(isWithinCallWindow(new Date('2026-07-07T20:00:00Z'), '09:00', '18:00', null)).toBe(false);
  });
});

describe('scheduled campaign start time regression (6 PM IST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaignContact.findMany as any).mockResolvedValue([{ id: 'c1', phoneNumber: '+1' }]);
    (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'prov-1' });
    (extractVobizCredentials as any).mockReturnValue({ authId: 'a', authToken: 't', fromNumber: '+9' });
    (runCampaign as any).mockResolvedValue({ total: 1, initiated: 1, failed: 0 });
  });

  const istEveningCampaign = () => baseCampaign({
    // 6:00 PM IST.
    scheduledAt: new Date('2026-07-07T12:30:00Z'),
    windowStart: '18:00',
    windowEnd: '21:00',
    timezone: IST,
  });

  it('dials at 6 PM IST even though the server clock reads 12:30 UTC', async () => {
    await processScheduledCampaign(istEveningCampaign(), new Date('2026-07-07T12:30:00Z'));

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.RUNNING },
    });
    expect(runCampaign).toHaveBeenCalled();
  });

  it('does not dial at 11:30 PM IST, which is outside the requested window', async () => {
    await processScheduledCampaign(istEveningCampaign(), new Date('2026-07-07T18:00:00Z'));

    expect(runCampaign).not.toHaveBeenCalled();
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('still holds the campaign before its start instant', async () => {
    await processScheduledCampaign(istEveningCampaign(), new Date('2026-07-07T12:29:00Z'));

    expect(runCampaign).not.toHaveBeenCalled();
  });
});

describe('resolvePublicBaseUrl / buildSchedulerAnswerUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses PUBLIC_BASE_URL and strips trailing slashes', () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://calls.example.com/');
    expect(resolvePublicBaseUrl()).toBe('https://calls.example.com');
  });

  it('falls back to localhost + PORT', () => {
    vi.stubEnv('PUBLIC_BASE_URL', '');
    vi.stubEnv('PORT', '4321');
    expect(resolvePublicBaseUrl()).toBe('http://localhost:4321');
  });

  it('builds an answer url with agent + contact context', () => {
    vi.stubEnv('PUBLIC_BASE_URL', 'https://calls.example.com');
    const url = buildSchedulerAnswerUrl('agent-1', 'contact-9');
    expect(url).toContain('https://calls.example.com/api/webhooks/vobiz/answer');
    expect(url).toContain('agentId=agent-1');
    expect(url).toContain('contactId=contact-9');
  });
});

describe('processScheduledCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips a campaign that is not due yet', async () => {
    const future = new Date('2026-07-08T00:00:00Z');
    await processScheduledCampaign(baseCampaign({ scheduledAt: future }), new Date('2026-07-07T00:00:00Z'));
    expect(prisma.campaignContact.findMany).not.toHaveBeenCalled();
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  it('skips a campaign outside its call window', async () => {
    await processScheduledCampaign(
      baseCampaign({ windowStart: '09:00', windowEnd: '18:00', timezone: 'UTC' }),
      new Date('2026-07-07T20:00:00Z'),
    );
    expect(prisma.campaignContact.findMany).not.toHaveBeenCalled();
  });

  it('promotes a scheduled campaign to running and dispatches a batch', async () => {
    (prisma.campaignContact.findMany as any).mockResolvedValue([{ id: 'c1', phoneNumber: '+1' }]);
    (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'prov-1' });
    (extractVobizCredentials as any).mockReturnValue({ authId: 'a', authToken: 't', fromNumber: '+9' });
    (runCampaign as any).mockResolvedValue({ total: 1, initiated: 1, failed: 0 });

    await processScheduledCampaign(baseCampaign(), new Date('2026-07-07T10:00:00'));

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.RUNNING },
    });
    expect(runCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'camp-1', agentId: 'agent-1' }),
    );
  });

  it('marks the campaign completed when no pending contacts remain', async () => {
    (prisma.campaignContact.findMany as any).mockResolvedValue([]);
    await processScheduledCampaign(
      baseCampaign({ status: CAMPAIGN_STATUS.RUNNING }),
      new Date('2026-07-07T10:00:00'),
    );
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.COMPLETED },
    });
    expect(runCampaign).not.toHaveBeenCalled();
  });

  it('fails the campaign when no active provider exists', async () => {
    (prisma.campaignContact.findMany as any).mockResolvedValue([{ id: 'c1', phoneNumber: '+1' }]);
    (prisma.telephonyProvider.findFirst as any).mockResolvedValue(null);
    await processScheduledCampaign(
      baseCampaign({ status: CAMPAIGN_STATUS.RUNNING }),
      new Date('2026-07-07T10:00:00'),
    );
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.FAILED },
    });
  });

  it('fails the campaign when provider credentials are incomplete', async () => {
    (prisma.campaignContact.findMany as any).mockResolvedValue([{ id: 'c1', phoneNumber: '+1' }]);
    (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'prov-1' });
    (extractVobizCredentials as any).mockReturnValue(null);
    await processScheduledCampaign(
      baseCampaign({ status: CAMPAIGN_STATUS.RUNNING, providerId: null }),
      new Date('2026-07-07T10:00:00'),
    );
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.FAILED },
    });
  });
});

describe('runSchedulerTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes each scheduled/running campaign', async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ id: 'camp-1', status: CAMPAIGN_STATUS.RUNNING }),
    ]);
    (prisma.campaignContact.findMany as any).mockResolvedValue([]);
    await runSchedulerTick(new Date('2026-07-07T10:00:00'));
    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'camp-1' },
      data: { status: CAMPAIGN_STATUS.COMPLETED },
    });
  });

  it('catches errors from an individual campaign', async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([
      baseCampaign({ id: 'camp-err', status: CAMPAIGN_STATUS.RUNNING }),
    ]);
    (prisma.campaignContact.findMany as any).mockRejectedValue(new Error('db down'));
    await expect(runSchedulerTick(new Date('2026-07-07T10:00:00'))).resolves.toBeUndefined();
  });

  it('defaults to the current time when none is provided', async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([]);
    await runSchedulerTick();
    expect(prisma.campaign.findMany).toHaveBeenCalled();
  });
});

describe('start/stop scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopCampaignScheduler();
    vi.useRealTimers();
  });

  it('starts once and runs ticks on the interval', async () => {
    (prisma.campaign.findMany as any).mockResolvedValue([]);
    startCampaignScheduler();
    // Second call is a no-op (already running).
    startCampaignScheduler();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(prisma.campaign.findMany).toHaveBeenCalled();
  });

  it('stops cleanly and tolerates a redundant stop', () => {
    startCampaignScheduler();
    stopCampaignScheduler();
    stopCampaignScheduler();
    expect(true).toBe(true);
  });
});
