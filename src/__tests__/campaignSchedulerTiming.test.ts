/**
 * When a campaign becomes dialable.
 *
 * A campaign can be held back for two predictable reasons: its start time has
 * not arrived, or its call window is shut. Both are computable, which is what
 * lets the scheduler wait for the answer instead of polling for it. The waiting
 * itself is covered in campaignSchedulerSleep.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';
import {
  nextDueInstant,
  processScheduledCampaign,
  type SchedulableCampaign,
} from '../services/campaignScheduler.js';
import { extractVobizCredentials } from '../services/vobizCalling.js';
import { runCampaign } from '../services/campaignRunner.js';
import { CAMPAIGN_STATUS } from '../types/index.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaign: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
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

const IST = 'Asia/Kolkata';

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

describe('nextDueInstant', () => {
  const now = new Date('2026-07-07T10:00:00Z');

  it('reports null for a campaign that is dialable right now', () => {
    expect(nextDueInstant(baseCampaign(), now)).toBeNull();
  });

  it('reports the start time of a campaign that has not begun', () => {
    const startsAt = new Date('2026-07-08T10:00:00Z');
    expect(nextDueInstant(baseCampaign({ scheduledAt: startsAt }), now)).toEqual(startsAt);
  });

  it('treats a start time already past as due now', () => {
    const startsAt = new Date('2026-07-06T10:00:00Z');
    expect(nextDueInstant(baseCampaign({ scheduledAt: startsAt }), now)).toBeNull();
  });

  it('reports the next window opening when the window is shut', () => {
    // 10:00 UTC, window 18:00-21:00 UTC, so it opens in 8 hours.
    const due = nextDueInstant(
      baseCampaign({ windowStart: '18:00', windowEnd: '21:00', timezone: 'UTC' }),
      now,
    );
    expect(due).toEqual(new Date('2026-07-07T18:00:00Z'));
  });

  it('reports null while inside the window', () => {
    const due = nextDueInstant(
      baseCampaign({ windowStart: '09:00', windowEnd: '18:00', timezone: 'UTC' }),
      now,
    );
    expect(due).toBeNull();
  });

  it('rolls to the next day when the window has already closed today', () => {
    // 10:00 UTC with a 06:00-09:00 window means waiting 20 hours.
    const due = nextDueInstant(
      baseCampaign({ windowStart: '06:00', windowEnd: '09:00', timezone: 'UTC' }),
      now,
    );
    expect(due).toEqual(new Date('2026-07-08T06:00:00Z'));
  });

  it('resolves the window in the campaign timezone', () => {
    // 10:00 UTC is 15:30 IST, so an 18:00 IST window opens 2h30m later.
    const due = nextDueInstant(
      baseCampaign({ windowStart: '18:00', windowEnd: '21:00', timezone: IST }),
      now,
    );
    expect(due).toEqual(new Date('2026-07-07T12:30:00Z'));
  });

  it('waits for the window when the start time lands outside it', () => {
    const due = nextDueInstant(
      baseCampaign({
        scheduledAt: new Date('2026-07-08T02:00:00Z'),
        windowStart: '09:00',
        windowEnd: '18:00',
        timezone: 'UTC',
      }),
      now,
    );
    expect(due).toEqual(new Date('2026-07-08T09:00:00Z'));
  });

  it('waits a full day for a window that can never open', () => {
    // start === end reads as permanently shut. Returning "now" would spin the
    // scheduler in a tight loop, so a degenerate window waits a whole day.
    const due = nextDueInstant(
      baseCampaign({ windowStart: '10:00', windowEnd: '10:00', timezone: 'UTC' }),
      now,
    );
    expect(due).toEqual(new Date('2026-07-08T10:00:00Z'));
  });
});

describe('scheduled campaign start time regression (6 PM IST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.campaignContact.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.campaignContact.count as any).mockResolvedValue(1);
    (prisma.campaignContact.findMany as any).mockResolvedValue([{ id: 'c1', phoneNumber: '+1' }]);
    (prisma.telephonyProvider.findFirst as any).mockResolvedValue({ id: 'prov-1', concurrencyLimit: 3 });
    (extractVobizCredentials as any).mockReturnValue({ authId: 'a', authToken: 't', fromNumber: '+9' });
    (runCampaign as any).mockResolvedValue({ total: 1, initiated: 1, failed: 0, queued: 0 });
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

