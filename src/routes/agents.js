import { Router } from 'express';
import prisma from '../lib/prisma.js';

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
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id — get single agent
router.get('/agents/:id', async (req, res) => {
  try {
    const agent = await prisma.voiceAgent.findUnique({
      where: { id: req.params.id },
    });
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// POST /api/agents — create agent
router.post('/agents', async (req, res) => {
  try {
    const { name, systemPrompt, voiceName, modelName } = req.body;

    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'Name and system prompt are required' });
    }

    if (voiceName) {
      const validVoice = AVAILABLE_VOICES.find(v => v.id === voiceName);
      if (!validVoice) {
        return res.status(400).json({ error: 'Invalid voice name' });
      }
    }

    if (modelName) {
      const validModel = AVAILABLE_MODELS.find(m => m.id === modelName);
      if (!validModel) {
        return res.status(400).json({ error: 'Invalid model name' });
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
    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PUT /api/agents/:id — update agent
router.put('/agents/:id', async (req, res) => {
  try {
    const { name, systemPrompt, voiceName, modelName } = req.body;

    if (voiceName) {
      const validVoice = AVAILABLE_VOICES.find(v => v.id === voiceName);
      if (!validVoice) {
        return res.status(400).json({ error: 'Invalid voice name' });
      }
    }

    if (modelName) {
      const validModel = AVAILABLE_MODELS.find(m => m.id === modelName);
      if (!validModel) {
        return res.status(400).json({ error: 'Invalid model name' });
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
    res.json(agent);
  } catch (error) {
    console.error('Error updating agent:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id — delete agent
router.delete('/agents/:id', async (req, res) => {
  try {
    await prisma.voiceAgent.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;
export { AVAILABLE_VOICES, AVAILABLE_MODELS };
