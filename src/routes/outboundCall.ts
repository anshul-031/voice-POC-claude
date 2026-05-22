import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  OUTBOUND_CALL_BODY_SCHEMA,
  REQUEST_HEADERS_SCHEMA,
} from '../constants/inputSchemas.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  extractVobizCredentials,
  initiateVobizCall,
} from '../services/vobizCalling.js';

const router = Router();

function hasJsonContentType(contentType?: string): boolean {
  return !contentType || contentType.includes('application/json');
}

/**
 * Build the answer_url that Vobiz will call when the callee picks up.
 */
function buildAnswerUrl(req: Request, agentId: string): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/api/webhooks/vobiz/answer?agentId=${encodeURIComponent(agentId)}`;
}

/**
 * Look up an active outbound telephony provider for the user.
 */
async function findActiveProvider(
  userId: string,
  providerId?: string,
): Promise<Record<string, unknown> | null> {
  const where: Record<string, unknown> = {
    userId,
    isActive: true,
    direction: 'outbound',
    provider: 'vobiz',
  };
  if (providerId) {
    where.id = providerId;
  }

  const provider = await prisma.telephonyProvider.findFirst({
    where,
  });
  return provider as Record<string, unknown> | null;
}

function validateOutboundRequest(req: AuthenticatedRequest, res: Response): Record<string, string> | null {
  const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(req.headers ?? {});
  if (!headersParse.success || !hasJsonContentType(headersParse.data['content-type'])) {
    res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    return null;
  }

  const bodyParse = OUTBOUND_CALL_BODY_SCHEMA.safeParse(req.body);
  if (!bodyParse.success) {
    res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    return null;
  }
  return bodyParse.data;
}

// POST /api/outbound-call — trigger an outbound call
router.post(
  '/',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;

    const data = validateOutboundRequest(req, res);
    if (!data) return;

    const { agentId, phoneNumber, providerId } = data;
    const userId = req.user?.id as string;

    try {
      // Verify the agent exists and belongs to the user
      const agent = await prisma.voiceAgent.findFirst({
        where: { id: agentId, userId },
      });
      if (!agent) {
        return res.status(404).json({
          error: UI_STRINGS.api.errors.agentNotFound,
        });
      }

      // Find an active outbound Vobiz provider
      const provider = await findActiveProvider(userId, providerId);
      if (!provider) {
        return res.status(404).json({
          error: UI_STRINGS.api.errors.noActiveProvider,
        });
      }

      // Extract Vobiz credentials
      const creds = extractVobizCredentials(provider);
      if (!creds) {
        return res.status(400).json({
          error: UI_STRINGS.api.errors.missingProviderCreds,
        });
      }

      // Build answer URL and initiate the call
      const answerUrl = buildAnswerUrl(req, agentId);
      const result = await initiateVobizCall(
        creds,
        phoneNumber,
        answerUrl,
      );

      if (!result.success) {
        logger.error('Outbound call failed', {
          agentId,
          phoneNumber,
          error: result.errorMessage,
        });
        return res.status(502).json({
          error: UI_STRINGS.api.errors.outboundCallFailed,
          detail: result.errorMessage,
        });
      }

      logger.info('Outbound call initiated', {
        agentId,
        phoneNumber,
        callId: result.callId,
        providerName: provider.name,
      });

      res.json({
        message: UI_STRINGS.api.success.outboundCallInitiated,
        callId: result.callId,
        agentId,
        phoneNumber,
        providerName: provider.name,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : String(error);
      logger.error('Error in outbound call handler', {
        agentId,
        phoneNumber,
        error: errMsg,
      });
      res.status(500).json({
        error: UI_STRINGS.api.errors.outboundCallFailed,
      });
    }
  },
);

export default router;
