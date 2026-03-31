import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { PRISMA_ERRORS, AUDIO_CONFIG } from '../types/index.js';
import { AVAILABLE_VOICES, AVAILABLE_MODELS } from '../constants/agents.js';
import {
  AGENT_ID_PARAMS_SCHEMA,
  AGENTS_LIST_QUERY_SCHEMA,
  CREATE_AGENT_BODY_SCHEMA,
  REQUEST_HEADERS_SCHEMA,
  UPDATE_AGENT_BODY_SCHEMA,
} from '../constants/inputSchemas.js';

const router = Router();

function getAgentValidationError(error: { issues: Array<{ path: PropertyKey[] }> }): string {
  const issuePaths = error.issues.map((issue) => String(issue.path[0] || ''));
  if (issuePaths.includes('voiceName')) {
    return UI_STRINGS.api.errors.invalidVoice;
  }
  if (issuePaths.includes('modelName')) {
    return UI_STRINGS.api.errors.invalidModel;
  }
  if (issuePaths.includes('name') || issuePaths.includes('systemPrompt')) {
    return UI_STRINGS.api.errors.requiredNamePrompt;
  }
  return UI_STRINGS.api.errors.invalidInput;
}

function hasJsonContentType(contentType?: string): boolean {
  return !contentType || contentType.includes('application/json');
}

// GET /api/voices — list available voices
router.get('/voices', (_req: Request, res: Response): void => {
  res.json(AVAILABLE_VOICES);
});

// GET /api/models — list available Gemini Live models
router.get('/models', (_req: Request, res: Response): void => {
  res.json(AVAILABLE_MODELS);
});

// GET /api/agents — list all agents
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/agents', async (_req: Request, res: Response): Promise<any> => {
  try {
    const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(_req.headers ?? {});
    const queryParse = AGENTS_LIST_QUERY_SCHEMA.safeParse(_req.query ?? {});
    if (!headersParse.success || !queryParse.success) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }
    const agents = await prisma.voiceAgent.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(agents);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching agents', { error: errMsg });
    res.status(500).json({ error: UI_STRINGS.api.errors.fetchAgents });
  }
});

// GET /api/agents/:id — get single agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get('/agents/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(req.headers ?? {});
    const paramsParse = AGENT_ID_PARAMS_SCHEMA.safeParse(req.params);
    if (!headersParse.success || !paramsParse.success) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }

    const agent = await prisma.voiceAgent.findUnique({
      where: { id: paramsParse.data.id },
    });
    if (!agent) {
      return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
    }
    res.json(agent);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error fetching agent', { id: req.params.id, error: errMsg });
    res.status(500).json({ error: UI_STRINGS.api.errors.fetchAgent });
  }
});

// POST /api/agents — create agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post('/agents', async (req: Request, res: Response): Promise<any> => {
  try {
    const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(req.headers ?? {});
    if (!headersParse.success || !hasJsonContentType(headersParse.data['content-type'])) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }

    const bodyParse = CREATE_AGENT_BODY_SCHEMA.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ error: getAgentValidationError(bodyParse.error) });
    }

    const { name, systemPrompt, voiceName, modelName } = bodyParse.data;

    const agent = await prisma.voiceAgent.create({
      data: {
        name,
        systemPrompt,
        voiceName: voiceName || AUDIO_CONFIG.DEFAULT_VOICE,
        modelName: modelName || AUDIO_CONFIG.DEFAULT_MODEL,
      },
    });
    logger.info('Agent created', { id: agent.id, name: agent.name });
    res.status(201).json(agent);
  } catch (error: unknown) {
    handleAgentError(error, res);
  }
});

/**
 * Prepares the data object for Prisma update.
 */
function prepareUpdateData(body: Record<string, string | undefined>): Record<string, string> {
  const { name, systemPrompt, voiceName, modelName } = body;
  return {
    ...(name && { name }),
    ...(systemPrompt && { systemPrompt }),
    ...(voiceName && { voiceName }),
    ...(modelName && { modelName }),
  };
}

/**
 * Handles agent-related errors for API routes.
 */
function handleAgentError(error: unknown, res: Response, id?: string): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  if (id) {
    logger.error('Error updating agent', { id, error: errorMsg });
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === PRISMA_ERRORS.NOT_FOUND) {
      res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
      return;
    }
    res.status(500).json({ error: UI_STRINGS.api.errors.updateAgent });
  } else {
    logger.error('Error creating agent', { error: errorMsg });
    res.status(500).json({ error: UI_STRINGS.api.errors.createAgent });
  }
}

// PUT /api/agents/:id — update agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.put('/agents/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(req.headers ?? {});
    const paramsParse = AGENT_ID_PARAMS_SCHEMA.safeParse(req.params);
    if (!headersParse.success || !paramsParse.success || !hasJsonContentType(headersParse.data['content-type'])) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }

    const bodyParse = UPDATE_AGENT_BODY_SCHEMA.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ error: getAgentValidationError(bodyParse.error) });
    }

    if (Object.keys(bodyParse.data).length === 0) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }

    const agent = await prisma.voiceAgent.update({
      where: { id: paramsParse.data.id },
      data: prepareUpdateData(bodyParse.data),
    });
    logger.info('Agent updated', { id: agent.id, name: agent.name });
    res.json(agent);
  } catch (error: unknown) {
    handleAgentError(error, res, req.params.id as string);
  }
});

// DELETE /api/agents/:id — delete agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.delete('/agents/:id', async (req: Request, res: Response): Promise<any> => {
  try {
    const headersParse = REQUEST_HEADERS_SCHEMA.safeParse(req.headers ?? {});
    const paramsParse = AGENT_ID_PARAMS_SCHEMA.safeParse(req.params);
    if (!headersParse.success || !paramsParse.success) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.invalidInput });
    }

    await prisma.voiceAgent.delete({
      where: { id: paramsParse.data.id },
    });
    logger.info('Agent deleted', { id: paramsParse.data.id });
    res.json({ message: UI_STRINGS.api.success.deleteAgent });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error deleting agent', { id: req.params.id, error: errorMsg });
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === PRISMA_ERRORS.NOT_FOUND) {
      return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
    }
    res.status(500).json({ error: UI_STRINGS.api.errors.deleteAgent });
  }
});

export default router;
export { AVAILABLE_VOICES, AVAILABLE_MODELS };
