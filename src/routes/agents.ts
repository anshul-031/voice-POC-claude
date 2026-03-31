import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { PRISMA_ERRORS, AUDIO_CONFIG } from '../types/index.js';
import { AVAILABLE_VOICES, AVAILABLE_MODELS } from '../constants/agents.js';

const router = Router();

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
    const agent = await prisma.voiceAgent.findUnique({
      where: { id: req.params.id as string },
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

/**
 * Validates agent data shared between POST and PUT requests.
 */
function validateAgentData(
  data: { name?: string; systemPrompt?: string; voiceName?: string; modelName?: string },
): string | null {
  const { name, systemPrompt, voiceName, modelName } = data;

  if (name === '' || systemPrompt === '') {
    return UI_STRINGS.api.errors.requiredNamePrompt;
  }

  if (voiceName && !AVAILABLE_VOICES.find(v => v.id === voiceName)) {
    return UI_STRINGS.api.errors.invalidVoice;
  }

  if (modelName && !AVAILABLE_MODELS.find(m => m.id === modelName)) {
    return UI_STRINGS.api.errors.invalidModel;
  }

  return null;
}

// POST /api/agents — create agent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post('/agents', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, systemPrompt, voiceName, modelName } = req.body;

    const validationError = validateAgentData({ name, systemPrompt, voiceName, modelName });
    if (validationError || !name || !systemPrompt) {
      return res.status(400).json({ error: validationError || UI_STRINGS.api.errors.requiredNamePrompt });
    }

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
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error creating agent', { error: errMsg });
    res.status(500).json({ error: UI_STRINGS.api.errors.createAgent });
  }
});

/**
 * Prepares the data object for Prisma update.
 */
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
    const validationError = validateAgentData(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const agent = await prisma.voiceAgent.update({
      where: { id: req.params.id as string },
      data: prepareUpdateData(req.body),
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
    await prisma.voiceAgent.delete({
      where: { id: req.params.id as string },
    });
    logger.info('Agent deleted', { id: req.params.id });
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
