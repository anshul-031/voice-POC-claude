import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../lib/prisma.js';
import { resolveHangupOutcome, applyCampaignHangup } from '../services/campaignCallOutcome.js';
import { CAMPAIGN_CONTACT_STATUS } from '../types/index.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    campaignContact: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const OUTCOME = UI_STRINGS.api.callOutcome;

describe('resolveHangupOutcome', () => {
  it('trusts the provider CallStatus above everything else', () => {
    expect(resolveHangupOutcome({ callStatus: 'completed', durationSecs: 0 }))
      .toEqual({ status: CAMPAIGN_CONTACT_STATUS.COMPLETED, detail: null });
    expect(resolveHangupOutcome({ callStatus: 'BUSY', durationSecs: 0 }))
      .toEqual({ status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: OUTCOME.busy });
    expect(resolveHangupOutcome({ callStatus: 'no-answer', durationSecs: 0 }))
      .toEqual({ status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: OUTCOME.noAnswer });
    expect(resolveHangupOutcome({ callStatus: 'timeout', durationSecs: 0 }).detail)
      .toBe(OUTCOME.noAnswer);
    expect(resolveHangupOutcome({ callStatus: 'cancel', durationSecs: 0 }).detail)
      .toBe(OUTCOME.cancelled);
    expect(resolveHangupOutcome({ callStatus: 'failed', durationSecs: 0 }).detail)
      .toBe(OUTCOME.temporaryFailure);
  });

  it('treats a normal clearing as a completed call', () => {
    expect(resolveHangupOutcome({ hangupCause: 'NORMAL_CLEARING', durationSecs: 42 }))
      .toEqual({ status: CAMPAIGN_CONTACT_STATUS.COMPLETED, detail: null });
  });

  it('explains why a call never connected', () => {
    const cases: [string, string][] = [
      ['USER_BUSY', OUTCOME.busy],
      ['NO_ANSWER', OUTCOME.noAnswer],
      ['NO_USER_RESPONSE', OUTCOME.noAnswer],
      ['CALL_REJECTED', OUTCOME.rejected],
      ['UNALLOCATED_NUMBER', OUTCOME.unreachable],
      ['INVALID_NUMBER_FORMAT', OUTCOME.unreachable],
      ['SUBSCRIBER_ABSENT', OUTCOME.unreachable],
      ['MACHINE_DETECTED', OUTCOME.machineDetected],
      ['ORIGINATOR_CANCEL', OUTCOME.cancelled],
      ['NORMAL_TEMPORARY_FAILURE', OUTCOME.temporaryFailure],
      ['MEDIA_TIMEOUT', OUTCOME.temporaryFailure],
      ['PROGRESS_TIMEOUT', OUTCOME.noAnswer],
      ['RECOVERY_ON_TIMER_EXPIRE', OUTCOME.noAnswer],
    ];

    for (const [cause, detail] of cases) {
      expect(resolveHangupOutcome({ hangupCause: cause, durationSecs: 0 }))
        .toEqual({ status: CAMPAIGN_CONTACT_STATUS.FAILED, detail });
    }
  });

  it('accepts billed airtime as proof of an answered call for unknown causes', () => {
    expect(resolveHangupOutcome({ hangupCause: 'SOMETHING_NEW', durationSecs: 12 }).status)
      .toBe(CAMPAIGN_CONTACT_STATUS.COMPLETED);
  });

  it('fails an unknown cause with no airtime, naming the cause', () => {
    const outcome = resolveHangupOutcome({ hangupCause: 'SOMETHING_NEW', durationSecs: 0 });
    expect(outcome.status).toBe(CAMPAIGN_CONTACT_STATUS.FAILED);
    expect(outcome.detail).toBe(OUTCOME.notConnected('SOMETHING_NEW'));
  });

  it('still fails a report that carries no cause at all', () => {
    const outcome = resolveHangupOutcome({ durationSecs: 0 });
    expect(outcome.status).toBe(CAMPAIGN_CONTACT_STATUS.FAILED);
    expect(outcome.detail).toBeTruthy();
  });
});

describe('applyCampaignHangup', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('resolves a ringing contact looked up by contactId', async () => {
    (prisma.campaignContact.findUnique as any).mockResolvedValue({
      id: 'ct-1',
      status: CAMPAIGN_CONTACT_STATUS.CALLING,
    });

    const applied = await applyCampaignHangup({
      contactId: 'ct-1',
      hangupCause: 'USER_BUSY',
      durationSecs: 0,
    });

    expect(applied).toBe(true);
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'ct-1' },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: OUTCOME.busy },
    });
  });

  it('falls back to the provider call id when no contactId is carried', async () => {
    (prisma.campaignContact.findFirst as any).mockResolvedValue({
      id: 'ct-9',
      status: CAMPAIGN_CONTACT_STATUS.CALLING,
    });

    await applyCampaignHangup({ callId: 'call-77', hangupCause: 'NO_ANSWER', durationSecs: 0 });

    expect(prisma.campaignContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callId: 'call-77' } }),
    );
    expect(prisma.campaignContact.update).toHaveBeenCalledWith({
      where: { id: 'ct-9' },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: OUTCOME.noAnswer },
    });
  });

  it('does nothing when the hangup identifies no contact', async () => {
    const applied = await applyCampaignHangup({ durationSecs: 0 });
    expect(applied).toBe(false);
    expect(prisma.campaignContact.update).not.toHaveBeenCalled();
  });

  it('does nothing when the contact no longer exists', async () => {
    (prisma.campaignContact.findUnique as any).mockResolvedValue(null);
    const applied = await applyCampaignHangup({ contactId: 'gone', durationSecs: 0 });
    expect(applied).toBe(false);
    expect(prisma.campaignContact.update).not.toHaveBeenCalled();
  });

  it('leaves an already-completed contact alone', async () => {
    // A completed row had a live media stream, which outranks any hangup cause.
    (prisma.campaignContact.findUnique as any).mockResolvedValue({
      id: 'ct-1',
      status: CAMPAIGN_CONTACT_STATUS.COMPLETED,
    });

    const applied = await applyCampaignHangup({
      contactId: 'ct-1',
      hangupCause: 'NO_ANSWER',
      durationSecs: 0,
    });

    expect(applied).toBe(false);
    expect(prisma.campaignContact.update).not.toHaveBeenCalled();
  });

  it('swallows database failures so the webhook still answers', async () => {
    (prisma.campaignContact.findUnique as any).mockRejectedValue(new Error('db down'));
    await expect(applyCampaignHangup({ contactId: 'ct-1', durationSecs: 0 })).resolves.toBe(false);
  });

  it('handles a non-Error rejection', async () => {
    (prisma.campaignContact.findUnique as any).mockRejectedValue('boom');
    await expect(applyCampaignHangup({ contactId: 'ct-1', durationSecs: 0 })).resolves.toBe(false);
  });
});
