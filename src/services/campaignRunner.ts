/**
 * Executes a campaign by placing an outbound call to every pending contact.
 *
 * Each call's answer_url carries the contactId so the signaling server can look
 * up that contact's per-row variables and substitute them into the agent's
 * system prompt when the Gemini Live session starts.
 */
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { initiateVobizCall, type VobizCredentials } from './vobizCalling.js';
import { CAMPAIGN_CONTACT_STATUS } from '../types/index.js';
import type { CampaignTriggerSummary } from '../types/index.js';

export interface RunCampaignContact {
  id: string;
  phoneNumber: string;
}

export interface RunCampaignParams {
  campaignId: string;
  agentId: string;
  contacts: RunCampaignContact[];
  creds: VobizCredentials;
  /** Builds the Vobiz answer_url for a given agent + campaign contact. */
  answerUrlBuilder: (agentId: string, contactId: string) => string;
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

  try {
    const result = await initiateVobizCall(params.creds, contact.phoneNumber, answerUrl);

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
 * Run a campaign: initiate an outbound call for each pending contact.
 */
export async function runCampaign(params: RunCampaignParams): Promise<CampaignTriggerSummary> {
  logger.info('Running campaign', {
    campaignId: params.campaignId,
    agentId: params.agentId,
    total: params.contacts.length,
  });

  let initiated = 0;
  let failed = 0;

  for (const contact of params.contacts) {
    const ok = await callContact(params, contact);
    if (ok) {
      initiated += 1;
    } else {
      failed += 1;
    }
  }

  logger.info('Campaign run completed', {
    campaignId: params.campaignId,
    initiated,
    failed,
  });

  return { total: params.contacts.length, initiated, failed };
}
