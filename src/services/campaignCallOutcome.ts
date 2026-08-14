/**
 * Resolves a campaign contact's final status from the provider's hangup report.
 *
 * A dialled contact is parked on "calling" the moment the provider accepts the
 * request. It only leaves that state when the media stream opens (the contact
 * is marked completed by the signaling server). Calls that ring out, hit a busy
 * line, are rejected, or are answered by a machine never open a stream, so
 * without this module they stayed on "calling" forever even though they failed.
 */
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import {
  CAMPAIGN_CONTACT_STATUS,
  VOBIZ_CALL_STATUS,
  VOBIZ_CONNECTED_HANGUP_CAUSES,
  VOBIZ_HANGUP_CAUSE,
} from '../types/index.js';
import type { CampaignCallOutcome, CampaignHangupReport } from '../types/index.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

const OUTCOME = UI_STRINGS.api.callOutcome;

/** Hangup causes that mean the call never reached a person, with the reason why. */
const CAUSE_DETAILS: Record<string, string> = {
  [VOBIZ_HANGUP_CAUSE.USER_BUSY]: OUTCOME.busy,
  [VOBIZ_HANGUP_CAUSE.NO_ANSWER]: OUTCOME.noAnswer,
  [VOBIZ_HANGUP_CAUSE.NO_USER_RESPONSE]: OUTCOME.noAnswer,
  [VOBIZ_HANGUP_CAUSE.SUBSCRIBER_ABSENT]: OUTCOME.unreachable,
  [VOBIZ_HANGUP_CAUSE.CALL_REJECTED]: OUTCOME.rejected,
  [VOBIZ_HANGUP_CAUSE.UNALLOCATED_NUMBER]: OUTCOME.unreachable,
  [VOBIZ_HANGUP_CAUSE.INVALID_NUMBER_FORMAT]: OUTCOME.unreachable,
  [VOBIZ_HANGUP_CAUSE.NORMAL_TEMPORARY_FAILURE]: OUTCOME.temporaryFailure,
  [VOBIZ_HANGUP_CAUSE.NORMAL_UNSPECIFIED]: OUTCOME.temporaryFailure,
  [VOBIZ_HANGUP_CAUSE.RECOVERY_ON_TIMER_EXPIRE]: OUTCOME.noAnswer,
  [VOBIZ_HANGUP_CAUSE.PROGRESS_TIMEOUT]: OUTCOME.noAnswer,
  [VOBIZ_HANGUP_CAUSE.MEDIA_TIMEOUT]: OUTCOME.temporaryFailure,
  // machine_detection is set to "hangup", so the provider drops these itself.
  [VOBIZ_HANGUP_CAUSE.MACHINE_DETECTED]: OUTCOME.machineDetected,
  [VOBIZ_HANGUP_CAUSE.ORIGINATOR_CANCEL]: OUTCOME.cancelled,
};

/** `CallStatus` is provider-normalised, so it outranks the raw hangup cause. */
const CALL_STATUS_OUTCOMES: Record<string, CampaignCallOutcome> = {
  [VOBIZ_CALL_STATUS.COMPLETED]: { status: CAMPAIGN_CONTACT_STATUS.COMPLETED, detail: null },
  [VOBIZ_CALL_STATUS.BUSY]: { status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: OUTCOME.busy },
  [VOBIZ_CALL_STATUS.NO_ANSWER]: { status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: OUTCOME.noAnswer },
  [VOBIZ_CALL_STATUS.TIMEOUT]: { status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: OUTCOME.noAnswer },
  [VOBIZ_CALL_STATUS.CANCEL]: { status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: OUTCOME.cancelled },
  [VOBIZ_CALL_STATUS.FAILED]: {
    status: CAMPAIGN_CONTACT_STATUS.FAILED,
    detail: OUTCOME.temporaryFailure,
  },
};

const CONNECTED_CAUSES: readonly string[] = VOBIZ_CONNECTED_HANGUP_CAUSES;

/**
 * Maps a hangup report onto a terminal contact status plus a readable reason.
 *
 * Precedence: the provider's normalised `CallStatus`, then a known hangup
 * cause, then billed airtime (a call with duration was clearly answered).
 */
export function resolveHangupOutcome(report: CampaignHangupReport): CampaignCallOutcome {
  const callStatus = (report.callStatus || '').trim().toLowerCase();
  const byStatus = CALL_STATUS_OUTCOMES[callStatus];
  if (byStatus) return byStatus;

  const cause = (report.hangupCause || '').trim().toUpperCase();
  if (CONNECTED_CAUSES.includes(cause)) {
    return { status: CAMPAIGN_CONTACT_STATUS.COMPLETED, detail: null };
  }

  const causeDetail = CAUSE_DETAILS[cause];
  if (causeDetail) {
    return { status: CAMPAIGN_CONTACT_STATUS.FAILED, detail: causeDetail };
  }

  // Unrecognised cause: billed airtime is the only remaining evidence that
  // somebody actually picked up.
  if (report.durationSecs > 0) {
    return { status: CAMPAIGN_CONTACT_STATUS.COMPLETED, detail: null };
  }
  return {
    status: CAMPAIGN_CONTACT_STATUS.FAILED,
    detail: OUTCOME.notConnected(cause || VOBIZ_CALL_STATUS.FAILED),
  };
}

interface ContactRef {
  id: string;
  status: string;
}

/**
 * Locates the contact a hangup belongs to. Campaign calls carry `contactId` on
 * the hangup URL; the `callId` lookup covers providers configured with a
 * static hangup URL in their own console.
 */
async function findHangupContact(report: CampaignHangupReport): Promise<ContactRef | null> {
  if (report.contactId) {
    return prisma.campaignContact.findUnique({
      where: { id: report.contactId },
      select: { id: true, status: true },
    }) as Promise<ContactRef | null>;
  }
  if (report.callId) {
    return prisma.campaignContact.findFirst({
      where: { callId: report.callId },
      select: { id: true, status: true },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<ContactRef | null>;
  }
  return null;
}

/**
 * Writes the terminal outcome of a hangup onto its campaign contact.
 *
 * Only contacts still on "calling" are touched: one already marked completed
 * had a live media stream, which is stronger evidence than any hangup cause.
 * Failures are swallowed so a webhook is never left without a response.
 * @returns true when a contact was updated.
 */
export async function applyCampaignHangup(report: CampaignHangupReport): Promise<boolean> {
  try {
    const contact = await findHangupContact(report);
    if (!contact) {
      logger.debug('Hangup report matched no campaign contact', {
        contactId: report.contactId ?? null,
        callId: report.callId ?? null,
      });
      return false;
    }

    if (contact.status !== CAMPAIGN_CONTACT_STATUS.CALLING) {
      logger.debug('Hangup report ignored for already-resolved contact', {
        contactId: contact.id,
        status: contact.status,
      });
      return false;
    }

    const outcome = resolveHangupOutcome(report);
    await prisma.campaignContact.update({
      where: { id: contact.id },
      data: { status: outcome.status, errorMessage: outcome.detail },
    });

    logger.info('Campaign contact resolved from hangup', {
      contactId: contact.id,
      status: outcome.status,
      hangupCause: report.hangupCause ?? null,
      durationSecs: report.durationSecs,
    });
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to apply hangup report to campaign contact', {
      contactId: report.contactId ?? null,
      callId: report.callId ?? null,
      error: errMsg,
    });
    return false;
  }
}
