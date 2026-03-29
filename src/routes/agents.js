import { Router } from 'express';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { UI_STRINGS } from '../constants/uiStrings.js';

const router = Router();

// Available Gemini voices
const AVAILABLE_VOICES = [
  { id: 'Puck', name: 'Puck', description: 'Warm & friendly — great all-rounder (default)' },
  { id: 'Charon', name: 'Charon', description: 'Deep & authoritative — ideal for formal agents' },
  { id: 'Kore', name: 'Kore', description: 'Bright & engaging — perfect for customer support' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Strong & bold — suited for assertive personas' },
  { id: 'Aoede', name: 'Aoede', description: 'Melodic & clear — excellent for narration' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Light & breezy — casual conversational tone' },
  { id: 'Leda', name: 'Leda', description: 'Calm & composed — great for professional settings' },
  { id: 'Orus', name: 'Orus', description: 'Rich & resonant — powerful presence' },
];

// Available Gemini Live models (verified via API — bidiGenerateContent support)
const AVAILABLE_MODELS = [
  {
    id: 'gemini-2.5-flash-native-audio-latest',
    name: 'Gemini 2.5 Flash Native Audio (Latest)',
    description: 'Latest stable native audio model',
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    name: 'Gemini 3.1 Flash Live (Preview)',
    description: 'Newest real-time model with advanced capabilities',
  },
  {
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    name: 'Gemini 2.5 Flash Native Audio (Dec 2025)',
    description: 'Native audio preview from December 2025',
  },
  {
    id: 'gemini-2.5-flash-native-audio-preview-09-2025',
    name: 'Gemini 2.5 Flash Native Audio (Sep 2025)',
    description: 'Native audio preview from September 2025',
  },
];

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
        voiceName: voiceName || 'Puck',
        modelName: modelName || 'gemini-2.5-flash-native-audio-latest',
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
    if (error.code === 'P2025') {
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
    if (error.code === 'P2025') {
      return res.status(404).json({ error: UI_STRINGS.api.errors.agentNotFound });
    }
    res.status(500).json({ error: UI_STRINGS.api.errors.deleteAgent });
  }
});

export default router;
export { AVAILABLE_VOICES, AVAILABLE_MODELS };
