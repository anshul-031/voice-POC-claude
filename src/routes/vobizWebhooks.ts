/**
 * Vobiz webhook handlers.
 *
 * When an outbound call is answered, Vobiz hits the answer_url.
 * We respond with XML containing a bidirectional <Stream> element
 * that connects the call audio to our WebSocket media bridge.
 */
import { Router, type Request, type Response } from 'express';
import logger from '../utils/logger.js';
import { ROUTES } from '../types/index.js';

const router = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFromBody(body: any, key1: string, key2: string, def = 'unknown'): string {
  if (!body) return def;
  return String(body[key1] || body[key2] || def);
}

/**
 * Build the WebSocket URL for the Vobiz media stream.
 * Includes agentId as a query parameter so the signaling server
 * knows which AI agent to start for this call.
 */
function buildStreamUrl(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'] as string | undefined;
  const rawProto = forwardedProto || req.protocol;
  const wsProto = rawProto === 'https' ? 'wss' : 'ws';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  const agentId = (req.query.agentId as string) || '';
  const queryString = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
  return `${wsProto}://${host}${ROUTES.WS_PATH}${queryString}`;
}

/**
 * POST /api/webhooks/vobiz/answer
 *
 * Called by Vobiz when the callee answers the phone.
 * Must return valid XML within 1-2 seconds.
 *
 * Returns a <Stream> element for bidirectional audio with our
 * WebSocket server, so the call audio flows to Gemini Live.
 */
router.post(
  '/answer',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req: Request, res: Response): any => {
    const callUuid = getFromBody(req.body, 'CallUUID', 'callUuid');
    const from = getFromBody(req.body, 'From', 'from');
    const to = getFromBody(req.body, 'To', 'to');
    const agentId = (req.query.agentId as string) || 'unknown';

    logger.info('Vobiz answer webhook received', {
      callUuid,
      from,
      to,
      agentId,
    });

    const streamUrl = buildStreamUrl(req);

    logger.info('Returning stream XML to Vobiz', {
      callUuid,
      streamUrl,
      agentId,
    });

    // Return XML instructions with bidirectional audio stream
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      '  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=8000">',
      `    ${streamUrl}`,
      '  </Stream>',
      '</Response>',
    ].join('\n');

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  },
);

/**
 * POST /api/webhooks/vobiz/hangup
 *
 * Optional: Called by Vobiz when the call ends.
 * Logs the hangup details for debugging / call history.
 */
router.post(
  '/hangup',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req: Request, res: Response): any => {
    const callUuid = getFromBody(req.body, 'CallUUID', 'callUuid');
    const cause = getFromBody(req.body, 'HangupCause', 'hangupCause');
    const duration = getFromBody(req.body, 'Duration', 'duration', '0');

    logger.info('Vobiz hangup webhook received', {
      callUuid,
      hangupCause: cause,
      duration,
    });

    res.set('Content-Type', 'application/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  },
);

export default router;
