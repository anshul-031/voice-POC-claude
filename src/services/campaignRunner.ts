/**
 * Executes a campaign by placing an outbound call to every pending contact.
 *
 * Each call's answer_url carries the contactId so the signaling server can look
 * up that contact's per-row variables and substitute them into the agent's
 * system prompt when the Gemini Live session starts. The hangup_url carries it
 * too, so a number that is never answered still gets a terminal status.
 *
 * Dialling is capped by the provider's concurrency limit. Telephony vendors
 * only allow a fixed number of simultaneous channels and reject or drop
 * everything beyond it, so firing an entire contact list at once burned
 * contacts that were never really attempted.
 */
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { initiateVobizCall, type VobizCredentials } from './vobizCalling.js';
import { CAMPAIGN_CONTACT_STATUS } from '../types/index.js';
import type { CampaignTriggerSummary } from '../types/index.js';
import { resolveConcurrency } from '../utils/concurrency.js';

export interface RunCampaignContact {
  id: string;
  phoneNumber: string;
}

export interface RunCampaignParams {
  campaignId: string;
  agentId: string;
  contacts: RunCampaignContact[];
  creds: VobizCredentials;
  /**
   * Maximum calls in flight at once. Falls back to the conservative default
   * when a provider predates the concurrency field.
   */
  concurrency?: number | null;
  /** Builds the Vobiz answer_url for a given agent + campaign contact. */
  answerUrlBuilder: (agentId: string, contactId: string) => string;
  /** Builds the Vobiz hangup_url, used to resolve unanswered calls. */
  hangupUrlBuilder?: (agentId: string, contactId: string) => string;
}

/**
 * Place a call for a single contact and persist the outcome.
 * @returns true when the call was successfully initiated.
 */
async function callContact(
  params: RunCampaignParams,
  contact: RunCampaignContact,
): Promise<boolean> {
  const answerUrl = params.answerUrlBuilder(params.agentId, contact.id);
  const hangupUrl = params.hangupUrlBuilder?.(params.agentId, contact.id);

  try {
    const result = await initiateVobizCall(
      params.creds,
      contact.phoneNumber,
      answerUrl,
      hangupUrl,
    );

    if (result.success) {
      await prisma.campaignContact.update({
        where: { id: contact.id },
        data: {
          status: CAMPAIGN_CONTACT_STATUS.CALLING,
          callId: result.callId ?? null,
          errorMessage: null,
        },
      });
      return true;
    }

    await prisma.campaignContact.update({
      where: { id: contact.id },
      data: {
        status: CAMPAIGN_CONTACT_STATUS.FAILED,
        errorMessage: result.errorMessage ?? 'Call failed',
      },
    });
    return false;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Campaign contact call failed', {
      campaignId: params.campaignId,
      contactId: contact.id,
      error: errMsg,
    });
    await prisma.campaignContact.update({
      where: { id: contact.id },
      data: { status: CAMPAIGN_CONTACT_STATUS.FAILED, errorMessage: errMsg },
    });
    return false;
  }
}

/**
 * Run a campaign: dial pending contacts without exceeding `concurrency` calls
 * in flight. Contacts beyond the limit are left pending for the scheduler to
 * pick up as channels free, and are reported as `queued`.
 */
export async function runCampaign(params: RunCampaignParams): Promise<CampaignTriggerSummary> {
  const concurrency = resolveConcurrency(params.concurrency);
  const attempts = params.contacts.slice(0, concurrency);
  const queued = params.contacts.length - attempts.length;

  logger.info('Running campaign', {
    campaignId: params.campaignId,
    agentId: params.agentId,
    total: attempts.length,
    queued,
    concurrency,
  });

  let initiated = 0;
  let failed = 0;

  const results = await Promise.all(
    attempts.map((contact) => callContact(params, contact)),
  );
  for (const ok of results) {
    if (ok) initiated += 1;
    else failed += 1;
  }

  logger.info('Campaign run completed', {
    campaignId: params.campaignId,
    initiated,
    failed,
    queued,
  });

  return { total: attempts.length, initiated, failed, queued };
}
