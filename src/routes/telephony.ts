import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import {
  CREATE_TELEPHONY_PROVIDER_SCHEMA,
  REQUEST_HEADERS_SCHEMA,
  TELEPHONY_ID_PARAMS_SCHEMA,
  UPDATE_TELEPHONY_PROVIDER_SCHEMA,
} from '../constants/inputSchemas.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function hasJsonContentType(contentType?: string): boolean {
  return !contentType || contentType.includes('application/json');
}

/**
 * Masks a credential string for safe display.
 */
function maskCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

/**
 * Strips sensitive credential fields from a provider record
 * so they are never leaked to the client.
 */
function sanitizeProvider(
  provider: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...provider,
    sipPassword: maskCredential(provider.sipPassword as string | null),
    apiKey: maskCredential(provider.apiKey as string | null),
    apiSecret: maskCredential(provider.apiSecret as string | null),
    authToken: maskCredential(provider.authToken as string | null),
  };
}

// GET /api/telephony — list all providers for authenticated user
router.get(
  '/',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(
        req.headers ?? {},
      );
      if (!headersParse.success) {
        return res.status(400).json({
          error: UI_STRINGS.api.errors.invalidInput,
        });
      }

      const providers = await prisma.telephonyProvider.findMany({
        where: { userId: req.user?.id },
        orderBy: { createdAt: 'desc' },
      });

      res.json(providers.map(sanitizeProvider));
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : String(error);
      logger.error('Error fetching telephony providers', {
        error: errMsg,
      });
      res.status(500).json({
        error: UI_STRINGS.api.errors.fetchTelephony,
      });
    }
  },
);

// GET /api/telephony/:id — get single provider
router.get(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = TELEPHONY_ID_PARAMS_SCHEMA.safeParse(
        req.params,
      );
      if (!paramsParse.success) {
        return res.status(400).json({
          error: UI_STRINGS.api.errors.invalidInput,
        });
      }

      const provider = await prisma.telephonyProvider.findFirst({
        where: { id: paramsParse.data.id, userId: req.user?.id },
      });

      if (!provider) {
        return res.status(404).json({
          error: UI_STRINGS.api.errors.telephonyNotFound,
        });
      }

      res.json(sanitizeProvider(provider));
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : String(error);
      logger.error('Error fetching telephony provider', {
        id: req.params.id,
        error: errMsg,
      });
      res.status(500).json({
        error: UI_STRINGS.api.errors.fetchTelephony,
      });
    }
  },
);

// POST /api/telephony — create provider
router.post(
  '/',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(
        req.headers ?? {},
      );
      if (
        !headersParse.success
        || !hasJsonContentType(headersParse.data['content-type'])
      ) {
        return res.status(400).json({
          error: UI_STRINGS.api.errors.invalidInput,
        });
      }

      const bodyParse = CREATE_TELEPHONY_PROVIDER_SCHEMA.safeParse(
        req.body,
      );
      if (!bodyParse.success) {
        return res.status(400).json({
          error: UI_STRINGS.api.errors.invalidInput,
        });
      }

      const provider = await prisma.telephonyProvider.create({
        data: {
          ...bodyParse.data,
          userId: req.user?.id as string,
        },
      });

      logger.info('Telephony provider created', {
        id: provider.id,
        name: provider.name,
        providerType: provider.provider,
      });

      res.status(201).json(sanitizeProvider(provider));
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : String(error);
      logger.error('Error creating telephony provider', {
        error: errMsg,
      });
      res.status(500).json({
        error: UI_STRINGS.api.errors.createTelephony,
      });
    }
  },
);

async function updateProviderDb(
  id: string,
  userId: string,
  body: unknown,
): Promise<{ status: number; data: Record<string, unknown> } | { status: number; error: string }> {
  const existing = await prisma.telephonyProvider.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return { status: 404, error: UI_STRINGS.api.errors.telephonyNotFound };
  }

  const bodyParse = UPDATE_TELEPHONY_PROVIDER_SCHEMA.safeParse(body);
  if (!bodyParse.success || Object.keys(bodyParse.data).length === 0) {
    return { status: 400, error: UI_STRINGS.api.errors.invalidInput };
  }

  const provider = await prisma.telephonyProvider.update({
    where: { id },
    data: bodyParse.data,
  });

  logger.info('Telephony provider updated', {
    id: provider.id,
    name: provider.name,
  });

  return { status: 200, data: provider };
}

// PUT /api/telephony/:id — update provider
router.put(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    const paramsParse = TELEPHONY_ID_PARAMS_SCHEMA.safeParse(
      req.params,
    );
    const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(
      req.headers ?? {},
    );
    const headersValid = headersParse.success
      && hasJsonContentType(headersParse.data['content-type']);
    if (!paramsParse.success || !headersValid) {
      return res.status(400).json({
        error: UI_STRINGS.api.errors.invalidInput,
      });
    }
    try {
      const updateResult = await updateProviderDb(
        paramsParse.data.id,
        req.user?.id as string,
        req.body,
      );

      if ('error' in updateResult) {
        return res.status(updateResult.status).json({
          error: updateResult.error,
        });
      }

      res.json(sanitizeProvider(updateResult.data));
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : String(error);
      logger.error('Error updating telephony provider', {
        id: req.params.id,
        error: errMsg,
      });
      res.status(500).json({
        error: UI_STRINGS.api.errors.updateTelephony,
      });
    }
  },
);

// DELETE /api/telephony/:id — delete provider
router.delete(
  '/:id',
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (_req: Request, res: Response): Promise<any> => {
    const req = _req as AuthenticatedRequest;
    try {
      const paramsParse = TELEPHONY_ID_PARAMS_SCHEMA.safeParse(
        req.params,
      );
      if (!paramsParse.success) {
        return res.status(400).json({
          error: UI_STRINGS.api.errors.invalidInput,
        });
      }

      const existing = await prisma.telephonyProvider.findFirst({
        where: {
          id: paramsParse.data.id,
          userId: req.user?.id,
        },
      });
      if (!existing) {
        return res.status(404).json({
          error: UI_STRINGS.api.errors.telephonyNotFound,
        });
      }

      await prisma.telephonyProvider.delete({
        where: { id: paramsParse.data.id },
      });

      logger.info('Telephony provider deleted', {
        id: paramsParse.data.id,
      });

      res.json({
        message: UI_STRINGS.api.success.deleteTelephony,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error
        ? error.message
        : String(error);
      logger.error('Error deleting telephony provider', {
        id: req.params.id,
        error: errMsg,
      });
      res.status(500).json({
        error: UI_STRINGS.api.errors.deleteTelephony,
      });
    }
  },
);

export default router;
