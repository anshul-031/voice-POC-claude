/**
 * Agent-specific constants
 */

export interface Voice {
  id: string;
  name: string;
  description: string;
}

export interface Model {
  id: string;
  name: string;
  description: string;
}

const MODEL_PROVIDER_PREFIX_PATTERN = /^gemini(?=[\s-]|$)/i;

export const AVAILABLE_VOICES: Voice[] = [
  { id: 'Puck', name: 'Puck', description: 'Warm & friendly — great all-rounder (default)' },
  { id: 'Charon', name: 'Charon', description: 'Deep & authoritative — ideal for formal agents' },
  { id: 'Kore', name: 'Kore', description: 'Bright & engaging — perfect for customer support' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Strong & bold — suited for assertive personas' },
  { id: 'Aoede', name: 'Aoede', description: 'Melodic & clear — excellent for narration' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Light & breezy — casual conversational tone' },
  { id: 'Leda', name: 'Leda', description: 'Calm & composed — great for professional settings' },
  { id: 'Orus', name: 'Orus', description: 'Rich & resonant — powerful presence' },
];

export const AVAILABLE_MODELS: Model[] = [
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

/**
 * Replaces the provider prefix in a model label with the current website brand.
 */
export function getWhitelabeledModelName(modelName: string, websiteName: string): string {
  const normalizedWebsiteName = websiteName.trim();
  if (!normalizedWebsiteName) {
    return modelName;
  }

  return modelName.replace(MODEL_PROVIDER_PREFIX_PATTERN, normalizedWebsiteName);
}

/**
 * Returns model options with branded display names, preserving ids/descriptions.
 */
export function getWhitelabeledModels(websiteName: string): Model[] {
  return AVAILABLE_MODELS.map((model) => ({
    ...model,
    name: getWhitelabeledModelName(model.name, websiteName),
  }));
}
