import { Router } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';
import { PRISMA_ERRORS, AUDIO_CONFIG } from '../types/index.js';
import { AVAILABLE_VOICES, AVAILABLE_MODELS } from '../constants/agents.js';

const router = Router();

// GET /api/voices — list available voices
router.get('/voices', (req, res) => {
  res.json(AVAILABLE_VOICES);
});

// GET /api/models — list available Gemini Live models
router.get('/models', (req, res) => {
  res.json(AVAILABLE_MODELS);
});

// GET /api/agents — list all agents
router.get('/agents', async (req, res) => {
  try {
    const agents = await prisma.voiceAgent.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(agents);
  } catch (error) {
    logger.error('Error fetching agents', { error: error.message });
    res.status(500).json({ error: UI_STRINGS.api.errors.fetchAgents });
  }
});

// GET /api/agents/:id — get single agent
router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await prisma.voiceAgent.findUnique({
      where: { id: req.params.id },
    });
    if (!agent) {
      return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
    }
    res.json(agent);
  } catch (error) {
    logger.error('Error fetching agent', { id: req.params.id, error: error.message });
    res.status(500).json({ error: UI_STRINGS.api.errors.fetchAgent });
  }
});

// POST /api/agents — create agent
router.post('/agents', async (req, res) => {
  try {
    const { name, systemPrompt, voiceName, modelName } = req.body;

    if (!name || !systemPrompt) {
      return res.status(400).json({ error: UI_STRINGS.api.errors.requiredNamePrompt });
    }

    if (voiceName) {
      const validVoice = AVAILABLE_VOICES.find(v => v.id === voiceName);
      if (!validVoice) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidVoice });
      }
    }

    if (modelName) {
      const validModel = AVAILABLE_MODELS.find(m => m.id === modelName);
      if (!validModel) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidModel });
      }
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
  } catch (error) {
    logger.error('Error creating agent', { error: error.message });
    res.status(500).json({ error: UI_STRINGS.api.errors.createAgent });
  }
});

// PUT /api/agents/:id — update agent
router.put('/agents/:id', async (req, res) => {
  try {
    const { name, systemPrompt, voiceName, modelName } = req.body;

    if (voiceName) {
      const validVoice = AVAILABLE_VOICES.find(v => v.id === voiceName);
      if (!validVoice) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidVoice });
      }
    }

    if (modelName) {
      const validModel = AVAILABLE_MODELS.find(m => m.id === modelName);
      if (!validModel) {
        return res.status(400).json({ error: UI_STRINGS.api.errors.invalidModel });
      }
    }

    const agent = await prisma.voiceAgent.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(systemPrompt && { systemPrompt }),
        ...(voiceName && { voiceName }),
        ...(modelName && { modelName }),
      },
    });
    logger.info('Agent updated', { id: agent.id, name: agent.name });
    res.json(agent);
  } catch (error) {
    logger.error('Error updating agent', { id: req.params.id, error: error.message });
    if (error.code === PRISMA_ERRORS.NOT_FOUND) {
      return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
    }
    res.status(500).json({ error: UI_STRINGS.api.errors.updateAgent });
  }
});

// DELETE /api/agents/:id — delete agent
router.delete('/agents/:id', async (req, res) => {
  try {
    await prisma.voiceAgent.delete({
      where: { id: req.params.id },
    });
    logger.info('Agent deleted', { id: req.params.id });
    res.json({ message: UI_STRINGS.api.success.deleteAgent });
  } catch (error) {
    logger.error('Error deleting agent', { id: req.params.id, error: error.message });
    if (error.code === PRISMA_ERRORS.NOT_FOUND) {
      return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
    }
    res.status(500).json({ error: UI_STRINGS.api.errors.deleteAgent });
  }
});

export default router;
export { AVAILABLE_VOICES, AVAILABLE_MODELS };
