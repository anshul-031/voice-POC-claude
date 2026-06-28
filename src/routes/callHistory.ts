/**
 * Call history routes.
 *
 * - GET    /api/call-history            list the authenticated user's calls
 * - GET    /api/call-history/:id        call detail + signed recording URL
 * - DELETE /api/call-history/:id        delete a call record (and its recording)
 * - POST   /api/call-history/:sessionId/recording   upload a browser call recording
 *
 * The recording upload endpoint is intentionally unauthenticated: browser preview
 * calls (public agents) have no logged-in user. It is gated by the unguessable
 * session id and refuses to overwrite an existing recording.
 */
import express, { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  CALL_HISTORY_ID_PARAMS_SCHEMA,
  CALL_HISTORY_SESSION_PARAMS_SCHEMA,
} from '../constants/inputSchemas.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { RECORDING } from '../types/index.js';
import { buildRecordingKey } from '../services/callHistoryService.js';
import { triggerCallAnalysis } from '../services/salesAnalyserService.js';
import { uploadRecording, getSignedRecordingUrl, deleteRecording } from '../services/r2Storage.js';

const router = Router();

/** Map a recording MIME type to a file extension for the storage key. */
function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'bin';
}

// GET /api/call-history — list the authenticated user's call history
router.get(
  '/',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const calls = await prisma.callHistory.findMany({
        where: { userId: req.user?.id },
        orderBy: { startedAt: 'desc' },
        include: { agent: { select: { name: true } } },
      });
      res.json(calls);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching call history', { error: errMsg });
      res.status(500).json({ error: UI_STRINGS.api.errors.fetchCallHistory });
    }
  },
);

// GET /api/call-history/:id — detail with a signed recording URL
router.get(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = CALL_HISTORY_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const call = await prisma.callHistory.findFirst({
        where: { id: paramsParse.data.id, userId: req.user?.id },
        include: { agent: { select: { name: true } } },
      });
      if (!call) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.callHistoryNotFound });
      }

      const recordingUrl = call.recordingKey
        ? await getSignedRecordingUrl(call.recordingKey)
        : null;
      return res.json({ ...call, recordingUrl });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching call record', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.fetchCallHistory });
    }
  },
);

// DELETE /api/call-history/:id — remove a call record and its recording
router.delete(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = CALL_HISTORY_ID_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const existing = await prisma.callHistory.findFirst({
        where: { id: paramsParse.data.id, userId: req.user?.id },
      });
      if (!existing) {
        return res.status(404).json({ error: UI_STRINGS.api.errors.callHistoryNotFound });
      }

      if (existing.recordingKey) {
        await deleteRecording(existing.recordingKey);
      }
      await prisma.callHistory.delete({ where: { id: paramsParse.data.id } });

      logger.info('Call record deleted', { id: paramsParse.data.id });
      return res.json({ message: UI_STRINGS.api.success.deleteCallHistory });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error deleting call record', { id: req.params.id, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.deleteCallHistory });
    }
  },
);

/** Store an uploaded recording buffer and link it to the call record. */
async function storeUploadedRecording(
  sessionId: string,
  body: Buffer,
  contentType: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const record = await prisma.callHistory.findUnique({ where: { sessionId } });
  if (!record) {
    return { status: 404, body: { error: UI_STRINGS.api.errors.callHistoryNotFound } };
  }
  if (record.recordingKey) {
    return { status: 409, body: { error: UI_STRINGS.api.errors.recordingAlreadyExists } };
  }

  const key = buildRecordingKey(sessionId, extensionFromMime(contentType));
  const storedKey = await uploadRecording(key, body, contentType);
  if (!storedKey) {
    return { status: 502, body: { error: UI_STRINGS.api.errors.recordingUploadFailed } };
  }

  const updated = await prisma.callHistory.update({
    where: { sessionId },
    data: { recordingKey: storedKey, recordingMimeType: contentType },
  });
  logger.info('Browser call recording stored', { sessionId, bytes: body.length });

  // Best-effort: forward to the Sales Analyser app when the agent has call
  // analysis enabled and the account has credentials. Public preview calls
  // (no userId/agentId) are safely ignored inside the service.
  void triggerCallAnalysis({
    id: updated.id,
    sessionId: updated.sessionId,
    agentId: updated.agentId,
    userId: updated.userId,
    phoneNumber: updated.phoneNumber,
    recordingKey: updated.recordingKey,
    recordingMimeType: updated.recordingMimeType,
  });

  return { status: 200, body: { message: UI_STRINGS.api.success.recordingUploaded } };
}

// POST /api/call-history/:sessionId/recording — upload a browser call recording
router.post(
  '/:sessionId/recording',
  express.raw({ type: '*/*', limit: RECORDING.MAX_UPLOAD_BYTES }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (req: Request, res: Response): Promise<any> => {
    try {
      const paramsParse = CALL_HISTORY_SESSION_PARAMS_SCHEMA.safeParse(req.params);
      if (!paramsParse.success) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
      }

      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.recordingMissingBody });
      }

      const contentType = req.headers['content-type'] || 'application/octet-stream';
      const result = await storeUploadedRecording(paramsParse.data.sessionId, body, contentType);
      return res.status(result.status).json(result.body);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error uploading call recording', { sessionId: req.params.sessionId, error: errMsg });
      return res.status(500).json({ error: UI_STRINGS.api.errors.recordingUploadFailed });
    }
  },
);

export default router;
