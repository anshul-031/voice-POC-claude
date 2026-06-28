/**
 * Integration settings routes.
 *
 * Lets an authenticated user connect their Sales Analyser account so that
 * completed call recordings can be sent there for analysis. Credentials are
 * stored at the account (User) level; per-agent toggles live on the agent.
 *
 * Endpoints:
 *   GET    /api/integration/sales-analyser  — connection status (never returns the password)
 *   PUT    /api/integration/sales-analyser  — save/update email + password
 *   DELETE /api/integration/sales-analyser  — disconnect (clear credentials)
 */
import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { isSalesAnalyserConfigured } from '../constants/config.js';
import { SALES_ANALYSER_CREDENTIALS_SCHEMA } from '../constants/inputSchemas.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/integration/sales-analyser — connection status (no secrets returned).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/sales-analyser', requireAuth, async (_req: Request, res: Response): Promise<any> => {
  const req = _req as AuthenticatedRequest;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: { salesAnalyserEmail: true, salesAnalyserPassword: true },
    });
    return res.json({
      // Whether the env-level base URL is configured (integration usable at all).
      available: isSalesAnalyserConfigured(),
      // Whether this account has saved credentials.
      connected: !!(user?.salesAnalyserEmail && user?.salesAnalyserPassword),
      email: user?.salesAnalyserEmail ?? null,
    });
  } catch (error: unknown) {
    logger.error('Error fetching Sales Analyser integration', { error: String(error) });
    return res.status(500).json({ error: 'Failed to fetch integration settings' });
  }
});

// PUT /api/integration/sales-analyser — save/update credentials.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.put('/sales-analyser', requireAuth, async (_req: Request, res: Response): Promise<any> => {
  const req = _req as AuthenticatedRequest;
  try {
    const parsed = SALES_ANALYSER_CREDENTIALS_SCHEMA.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'A valid email and password are required' });
    }

    await prisma.user.update({
      where: { id: req.user?.id },
      data: {
        salesAnalyserEmail: parsed.data.email,
        salesAnalyserPassword: parsed.data.password,
      },
    });
    logger.info('Sales Analyser credentials updated', { userId: req.user?.id });
    return res.json({ success: true, connected: true, email: parsed.data.email });
  } catch (error: unknown) {
    logger.error('Error saving Sales Analyser integration', { error: String(error) });
    return res.status(500).json({ error: 'Failed to save integration settings' });
  }
});

// DELETE /api/integration/sales-analyser — disconnect.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.delete('/sales-analyser', requireAuth, async (_req: Request, res: Response): Promise<any> => {
  const req = _req as AuthenticatedRequest;
  try {
    await prisma.user.update({
      where: { id: req.user?.id },
      data: { salesAnalyserEmail: null, salesAnalyserPassword: null },
    });
    logger.info('Sales Analyser credentials cleared', { userId: req.user?.id });
    return res.json({ success: true, connected: false });
  } catch (error: unknown) {
    logger.error('Error clearing Sales Analyser integration', { error: String(error) });
    return res.status(500).json({ error: 'Failed to clear integration settings' });
  }
});

export default router;
