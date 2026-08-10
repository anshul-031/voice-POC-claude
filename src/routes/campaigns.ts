/* eslint-disable max-lines */
import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  CREATE_CAMPAIGN_BODY_SCHEMA,
  UPDATE_CAMPAIGN_BODY_SCHEMA,
  SCHEDULE_CAMPAIGN_BODY_SCHEMA,
  CAMPAIGN_ID_PARAMS_SCHEMA,
  REQUEST_HEADERS_SCHEMA,
  type CreateCampaignBody,
  type ScheduleCampaignBody,
} from '../constants/inputSchemas.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { CAMPAIGN_STATUS, CAMPAIGN_CONTACT_STATUS, TELEPHONY_DIRECTION, TELEPHONY_PROVIDER, WALLET } from '../types/index.js';
import {
  parseCampaignSpreadsheet,
  CampaignParseError,
  campaignParseErrorMessage,
  buildCampaignTemplate,
  getMissingRequiredColumns,
} from '../services/excelParser.js';
import { extractTemplateVariables } from '../utils/templateVariables.js';
import { extractVobizCredentials } from '../services/vobizCalling.js';
import { runCampaign, type RunCampaignContact } from '../services/campaignRunner.js';
import { canStartWalletCall } from '../services/walletService.js';
import { zonedWallClockToUtc } from '../utils/timezone.js';

const router = Router();

type HandlerResult = { status: number; body: Record<string, unknown> };

function hasJsonContentType(contentType?: string): boolean {
  return !contentType || contentType.includes('application/json');
}

/** Validates the request carries a JSON content-type header. */
function hasValidJsonHeaders(req: Request): boolean {
  const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(req.headers ?? {});
  return headersParse.success && hasJsonContentType(headersParse.data['content-type']);
}

/** Decodes a base64 (or data-URL) string into a Buffer. */
function decodeBase64File(input: string): Buffer {
  const commaIndex = input.indexOf(',');
  const base64 = input.startsWith('data:') && commaIndex >= 0
    ? input.slice(commaIndex + 1)
    : input;
  return Buffer.from(base64, 'base64');
}

/** Builds the Vobiz answer_url carrying agent + campaign contact context. */
function buildCampaignAnswerUrl(req: Request, agentId: string, contactId: string): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const query = `agentId=${encodeURIComponent(agentId)}&contactId=${encodeURIComponent(contactId)}`;
  return `${proto}://${host}/api/webhooks/vobiz/answer?${query}`;
}

/** Looks up an active outbound Vobiz provider for the user. */
async function findActiveProvider(
  userId: string,
  providerId?: string | null,
): Promise<Record<string, unknown> | null> {
  const where: Record<string, unknown> = {
    userId,
    isActive: true,
    direction: TELEPHONY_DIRECTION.OUTBOUND,
    provider: TELEPHONY_PROVIDER.VOBIZ,
  };
  if (providerId) {
    where.id = providerId;
  }
  const provider = await prisma.telephonyProvider.findFirst({ where });
  return provider as Record<string, unknown> | null;
}

// GET /api/campaigns — list campaigns for the authenticated user
router.get(
  '/',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const campaigns = await prisma.campaign.findMany({
        where: { userId: req.user?.id },
        orderBy: { createdAt: 'desc' },
        include: {
          agent: { select: { name: true } },
          provider: { select: { name: true } },
          _count: { select: { contacts: true } },
        },
      });
      res.json(campaigns);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching campaigns', { error: errMsg });
      res.status(500).json({ error: UI_STRINGS.api.errors.fetchCampaigns });
    }
  },
);

// GET /api/campaigns/:id — campaign detail with contacts
router.get(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const campaign = await prisma.campaign.findFirst({
        where: { id: paramsParse.data.id, userId: req.user?.id },
        include: {
          agent: { select: { name: true } },
          provider: { select: { name: true } },
          contacts: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!campaign) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.campaignNotFound });
      }

      res.json(campaign);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching campaign', { id: req.params.id, error: errMsg });
      res.status(500).json({ error: UI_STRINGS.api.errors.fetchCampaign });
    }
  },
);

/** Validates the agent referenced by a campaign belongs to the user. */
async function userOwnsAgent(agentId: string, userId: string): Promise<boolean> {
  const agent = await prisma.voiceAgent.findFirst({ where: { id: agentId, userId } });
  return !!agent;
}

type ResolvedCreateAgent = { agent: { systemPrompt: string } } | HandlerResult;

/** Resolves and authorizes the agent + provider referenced by a create request. */
async function resolveCreateAgent(
  data: CreateCampaignBody,
  userId: string,
): Promise<ResolvedCreateAgent> {
  const agent = await prisma.voiceAgent.findFirst({
    where: { id: data.agentId, userId },
  }) as { systemPrompt: string } | null;
  if (!agent) {
    return { status: 404, body: { error: UI_STRINGS.api.errors.agentNotFound } };
  }
  if (data.providerId) {
    const provider = await prisma.telephonyProvider.findFirst({
      where: { id: data.providerId, userId },
    });
    if (!provider) {
      return { status: 404, body: { error: UI_STRINGS.api.errors.telephonyNotFound } };
    }
  }
  return { agent };
}

/** Parses the upload, returning the contacts or an error result. */
function parseUpload(fileBase64: string): { parsed: ReturnType<typeof parseCampaignSpreadsheet> } | HandlerResult {
  try {
    return { parsed: parseCampaignSpreadsheet(decodeBase64File(fileBase64)) };
  } catch (parseError: unknown) {
    if (parseError instanceof CampaignParseError) {
      return { status: 400, body: { error: campaignParseErrorMessage(parseError.code) } };
    }
    throw parseError;
  }
}

/** Builds and persists a campaign (with contacts) from validated upload data. */
async function createCampaignFromUpload(
  data: CreateCampaignBody,
  userId: string,
): Promise<HandlerResult> {
  const resolved = await resolveCreateAgent(data, userId);
  if ('status' in resolved) return resolved;

  const parsedResult = parseUpload(data.fileBase64);
  if ('status' in parsedResult) return parsedResult;
  const { parsed } = parsedResult;

  const required = extractTemplateVariables(resolved.agent.systemPrompt || '');
  const missing = getMissingRequiredColumns(parsed.variableColumns, required);
  if (missing.length > 0) {
    return {
      status: 400,
      body: { error: `${UI_STRINGS.api.errors.campaignMissingColumns}: ${missing.join(', ')}` },
    };
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      agentId: data.agentId,
      providerId: data.providerId ?? null,
      variableColumns: parsed.variableColumns,
      status: CAMPAIGN_STATUS.DRAFT,
      userId,
      contacts: {
        create: parsed.contacts.map((contact) => ({
          phoneNumber: contact.phoneNumber,
          variables: contact.variables,
        })),
      },
    },
    include: { _count: { select: { contacts: true } } },
  });

  logger.info('Campaign created', {
    id: campaign.id,
    name: campaign.name,
    contacts: parsed.contacts.length,
  });

  return { status: 201, body: campaign };
}

// GET /api/campaigns/template/:agentId — download a sample contacts spreadsheet
router.get(
  '/template/:agentId',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const agentId = String(req.params.agentId || '').trim();
      if (!agentId) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const agent = await prisma.voiceAgent.findFirst({
        where: { id: agentId, userId: req.user?.id },
      }) as { systemPrompt: string } | null;
      if (!agent) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
      }

      const buffer = buildCampaignTemplate(agent.systemPrompt || '');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', 'attachment; filename="campaign-template.xlsx"');
      return res.send(buffer);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error building campaign template', { agentId: req.params.agentId, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.fetchCampaign });
    }
  },
);

// POST /api/campaigns — create a campaign from an uploaded spreadsheet
router.post(
  '/',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      if (!hasValidJsonHeaders(req)) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const bodyParse = CREATE_CAMPAIGN_BODY_SCHEMA.safeParse(req.body);
      if (!bodyParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const result = await createCampaignFromUpload(bodyParse.data, req.user?.id as string);
      return res.status(result.status).json(result.body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error creating campaign', { error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.createCampaign });
    }
  },
);

/** Validates and applies a campaign metadata update. */
async function updateCampaignDb(
  id: string,
  userId: string,
  body: unknown,
): Promise<HandlerResult> {
  const existing = await prisma.campaign.findFirst({ where: { id, userId } });
  if (!existing) {
    return { status: 404, body: { error: UI_STRINGS.api.errors.campaignNotFound } };
  }

  const bodyParse = UPDATE_CAMPAIGN_BODY_SCHEMA.safeParse(body);
  if (!bodyParse.success || Object.keys(bodyParse.data).length === 0) {
    return { status: 400, body: { error: UI_STRINGS.api.errors.invalidInput } };
  }

  if (bodyParse.data.agentId && !(await userOwnsAgent(bodyParse.data.agentId, userId))) {
    return { status: 404, body: { error: UI_STRINGS.api.errors.agentNotFound } };
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: bodyParse.data,
  });

  logger.info('Campaign updated', { id: campaign.id });
  return { status: 200, body: campaign };
}

// PUT /api/campaigns/:id — update campaign metadata
router.put(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
    if (!paramsParse.success || !hasValidJsonHeaders(req)) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }

    try {
      const result = await updateCampaignDb(
        paramsParse.data.id,
        req.user?.id as string,
        req.body,
      );
      return res.status(result.status).json(result.body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error updating campaign', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.updateCampaign });
    }
  },
);

// DELETE /api/campaigns/:id — delete a campaign (cascades contacts)
router.delete(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const existing = await prisma.campaign.findFirst({
        where: { id: paramsParse.data.id, userId: req.user?.id },
      });
      if (!existing) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.campaignNotFound });
      }

      await prisma.campaign.delete({ where: { id: paramsParse.data.id } });

      logger.info('Campaign deleted', { id: paramsParse.data.id });
      res.json({ message: UI_STRINGS.api.success.deleteCampaign });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error deleting campaign', { id: req.params.id, error: errMsg });
      res.status(500).json({ error: UI_STRINGS.api.errors.deleteCampaign });
    }
  },
);

/** Loads a runnable campaign and its pending contacts, or returns an error tuple. */
async function loadRunnableCampaign(
  id: string,
  userId: string,
): Promise<
  | { error: string; status: number }
  | { campaign: { id: string; agentId: string; providerId: string | null }; contacts: RunCampaignContact[] }
> {
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId },
    include: {
      contacts: {
        where: { status: CAMPAIGN_CONTACT_STATUS.PENDING },
        select: { id: true, phoneNumber: true },
      },
    },
  });

  if (!campaign) {
    return { error: UI_STRINGS.api.errors.campaignNotFound, status: 404 };
  }
  if (campaign.contacts.length === 0) {
    return { error: UI_STRINGS.api.errors.campaignNotRunnable, status: 400 };
  }

  return {
    campaign: { id: campaign.id, agentId: campaign.agentId, providerId: campaign.providerId },
    contacts: campaign.contacts,
  };
}

/** Loads a runnable campaign, dials its pending contacts, and records the outcome. */
async function triggerCampaignRun(
  req: AuthenticatedRequest,
  id: string,
  userId: string,
): Promise<HandlerResult> {
  const loaded = await loadRunnableCampaign(id, userId);
  if ('error' in loaded) {
    return { status: loaded.status, body: { error: loaded.error } };
  }

  if (!await canStartWalletCall(userId)) {
    return {
      status: WALLET.PAYMENT_REQUIRED_STATUS,
      body: { error: UI_STRINGS.api.errors.insufficientBalance },
    };
  }

  const provider = await findActiveProvider(userId, loaded.campaign.providerId);
  if (!provider) {
    return { status: 404, body: { error: UI_STRINGS.api.errors.noActiveProvider } };
  }

  const creds = extractVobizCredentials(provider);
  if (!creds) {
    return { status: 400, body: { error: UI_STRINGS.api.errors.missingProviderCreds } };
  }

  await prisma.campaign.update({
    where: { id: loaded.campaign.id },
    data: { status: CAMPAIGN_STATUS.RUNNING },
  });

  const summary = await runCampaign({
    campaignId: loaded.campaign.id,
    agentId: loaded.campaign.agentId,
    contacts: loaded.contacts,
    creds,
    answerUrlBuilder: (agentId, contactId) => buildCampaignAnswerUrl(req, agentId, contactId),
  });

  const finalStatus = summary.initiated > 0 ? CAMPAIGN_STATUS.COMPLETED : CAMPAIGN_STATUS.FAILED;
  await prisma.campaign.update({
    where: { id: loaded.campaign.id },
    data: { status: finalStatus },
  });

  logger.info('Campaign triggered', { id: loaded.campaign.id, ...summary });
  return { status: 200, body: { status: finalStatus, ...summary } };
}

// POST /api/campaigns/:id/trigger — place calls to all pending contacts
router.post(
  '/:id/trigger',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const result = await triggerCampaignRun(req, paramsParse.data.id, req.user?.id as string);
      return res.status(result.status).json(result.body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error triggering campaign', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.triggerCampaign });
    }
  },
);

// POST /api/campaigns/:id/retrigger — reset all contacts to pending and dial again
router.post(
  '/:id/retrigger',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    const userId = req.user?.id as string;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const existing = await prisma.campaign.findFirst({
        where: { id: paramsParse.data.id, userId },
      });
      if (!existing) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.campaignNotFound });
      }

      await prisma.campaignContact.updateMany({
        where: { campaignId: paramsParse.data.id },
        data: { status: CAMPAIGN_CONTACT_STATUS.PENDING, callId: null, errorMessage: null },
      });

      logger.info('Campaign contacts reset for re-trigger', { id: paramsParse.data.id });
      const result = await triggerCampaignRun(req, paramsParse.data.id, userId);
      return res.status(result.status).json(result.body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error re-triggering campaign', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.triggerCampaign });
    }
  },
);

/** Sentinel distinguishing "no start time" from "start time could not be parsed". */
const INVALID_SCHEDULE = Symbol('invalidSchedule');

/**
 * Turns the request's start time into an absolute instant.
 *
 * `scheduledAtLocal` + `timezone` is preferred: the wall clock the user picked
 * is resolved here against an explicit zone, so the stored instant no longer
 * depends on the timezone of whichever machine ran the browser. `scheduledAt`
 * stays supported for clients that already send a UTC instant.
 */
function resolveScheduledInstant(
  scheduledAt?: string | null,
  scheduledAtLocal?: string | null,
  timezone?: string | null,
): Date | null | typeof INVALID_SCHEDULE {
  if (scheduledAtLocal) {
    return zonedWallClockToUtc(scheduledAtLocal, timezone) ?? INVALID_SCHEDULE;
  }
  if (!scheduledAt) return null;

  const parsed = new Date(scheduledAt);
  return Number.isNaN(parsed.getTime()) ? INVALID_SCHEDULE : parsed;
}

/** Validates the schedule body and persists the start time + call window. */
async function scheduleCampaignDb(
  id: string,
  userId: string,
  body: unknown,
): Promise<HandlerResult> {
  const bodyParse = SCHEDULE_CAMPAIGN_BODY_SCHEMA.safeParse(body);
  if (!bodyParse.success) {
    return { status: 400, body: { error: UI_STRINGS.api.errors.invalidInput } };
  }

  const existing = await prisma.campaign.findFirst({ where: { id, userId } });
  if (!existing) {
    return { status: 404, body: { error: UI_STRINGS.api.errors.campaignNotFound } };
  }

  const { scheduledAt, scheduledAtLocal, timezone } = bodyParse.data;

  // Resolve the start instant before touching the DB so a malformed wall clock
  // does not leave contacts reset with no schedule attached.
  const startsAt = resolveScheduledInstant(scheduledAt, scheduledAtLocal, timezone);
  if (startsAt === INVALID_SCHEDULE) {
    return { status: 400, body: { error: UI_STRINGS.api.errors.invalidInput } };
  }

  return persistCampaignSchedule(id, bodyParse.data, startsAt);
}

/** Applies a validated schedule: resets contacts, then stores the start + window. */
async function persistCampaignSchedule(
  id: string,
  data: ScheduleCampaignBody,
  startsAt: Date | null,
): Promise<HandlerResult> {
  const { timezone, windowStart, windowEnd } = data;

  // Reset every contact back to PENDING so the scheduled run has contacts to
  // dial. Scheduling is offered for completed/failed campaigns (whose contacts
  // are no longer pending); without this reset the scheduler would find zero
  // pending contacts and immediately mark the campaign COMPLETED without
  // placing a single call.
  await prisma.campaignContact.updateMany({
    where: { campaignId: id },
    data: { status: CAMPAIGN_CONTACT_STATUS.PENDING, callId: null, errorMessage: null },
  });

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      scheduledAt: startsAt,
      windowStart: windowStart ?? null,
      windowEnd: windowEnd ?? null,
      timezone: timezone ?? null,
      status: CAMPAIGN_STATUS.SCHEDULED,
    },
  });

  logger.info('Campaign scheduled', {
    id: campaign.id,
    scheduledAt: startsAt ? startsAt.toISOString() : null,
    timezone: timezone ?? null,
    windowStart: windowStart ?? null,
    windowEnd: windowEnd ?? null,
  });
  return { status: 200, body: campaign };
}

// POST /api/campaigns/:id/schedule — set start time + call window and queue it
router.post(
  '/:id/schedule',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success || !hasValidJsonHeaders(req)) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const result = await scheduleCampaignDb(paramsParse.data.id, req.user?.id as string, req.body);
      return res.status(result.status).json(result.body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error scheduling campaign', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.scheduleCampaign });
    }
  },
);

// POST /api/campaigns/:id/pause — halt a scheduled/running campaign
router.post(
  '/:id/pause',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    const userId = req.user?.id as string;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const existing = await prisma.campaign.findFirst({
        where: { id: paramsParse.data.id, userId },
      });
      if (!existing) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.campaignNotFound });
      }

      const pausable: string[] = [CAMPAIGN_STATUS.SCHEDULED, CAMPAIGN_STATUS.RUNNING];
      if (!pausable.includes(existing.status)) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.campaignNotPausable });
      }

      const campaign = await prisma.campaign.update({
        where: { id: paramsParse.data.id },
        data: { status: CAMPAIGN_STATUS.PAUSED },
      });

      logger.info('Campaign paused', { id: campaign.id });
      return res.json(campaign);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error pausing campaign', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.pauseCampaign });
    }
  },
);

/** Resumes into SCHEDULED when a future start time remains, otherwise RUNNING. */
function resumeStatusFor(scheduledAt: Date | null, now: Date): string {
  if (scheduledAt && scheduledAt > now) return CAMPAIGN_STATUS.SCHEDULED;
  return CAMPAIGN_STATUS.RUNNING;
}

// POST /api/campaigns/:id/resume — continue a paused campaign
router.post(
  '/:id/resume',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    const userId = req.user?.id as string;
    try {
      const paramsParse = CAMPAIGN_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const existing = await prisma.campaign.findFirst({
        where: { id: paramsParse.data.id, userId },
      });
      if (!existing) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.campaignNotFound });
      }

      if (existing.status !== CAMPAIGN_STATUS.PAUSED) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.campaignNotResumable });
      }

      const campaign = await prisma.campaign.update({
        where: { id: paramsParse.data.id },
        data: { status: resumeStatusFor(existing.scheduledAt, new Date()) },
      });

      logger.info('Campaign resumed', { id: campaign.id, status: campaign.status });
      return res.json(campaign);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error resuming campaign', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.resumeCampaign });
    }
  },
);

export default router;
