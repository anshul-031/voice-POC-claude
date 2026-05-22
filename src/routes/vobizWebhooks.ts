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

/**
 * Build the WebSocket URL for the Vobiz media stream.
 */
function buildStreamUrl(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'] as string | undefined;
  const rawProto = forwardedProto || req.protocol;
  const wsProto = rawProto === 'https' ? 'wss' : 'ws';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${wsProto}://${host}${ROUTES.WS_PATH}`;
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
    const callUuid = req.body?.CallUUID || req.body?.callUuid || 'unknown';
    const from = req.body?.From || req.body?.from || 'unknown';
    const to = req.body?.To || req.body?.to || 'unknown';

    logger.info('Vobiz answer webhook received', {
      callUuid,
      from,
      to,
    });

    const streamUrl = buildStreamUrl(req);

    logger.info('Returning stream XML to Vobiz', {
      callUuid,
      streamUrl,
    });

    // Return XML instructions with bidirectional audio stream
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=8000">`,
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
    const callUuid = req.body?.CallUUID || req.body?.callUuid || 'unknown';
    const cause = req.body?.HangupCause || req.body?.hangupCause || 'unknown';
    const duration = req.body?.Duration || req.body?.duration || '0';

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
