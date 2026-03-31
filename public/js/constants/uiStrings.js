/**
 * Centralized UI Strings for Internationalization (i18n)
 * This object contains all user-facing literals used in the application.
 */
export const UI_STRINGS = {
  common: {
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save Changes',
    create: 'Create Agent',
    delete: 'Delete',
    confirmDelete: 'Are you sure?',
    edit: 'Edit',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    info: 'Info',
  },
  header: {
    title: 'VoiceForge',
    apiStatus: {
      checking: 'Checking API...',
      connected: 'Connected',
      disconnected: 'Disconnected',
    },
  },
  agentList: {
    title: 'Voice Agents',
    newAgent: 'New Agent',
    empty: {
      title: 'No agents yet.',
      description: 'Click "New Agent" to create your first voice agent.',
    },
    card: {
      testCall: 'Test Call',
      createdAt: (/** @type {any} */ date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
  },
  emptyState: {
    title: 'Create Your First Voice Agent',
    description: 'Configure an AI voice agent with a custom personality, system prompt, and voice. Test it with a live call right in your browser.',
  },
  form: {
    createTitle: 'Create New Agent',
    editTitle: 'Edit Agent',
    nameLabel: 'Agent Name',
    namePlaceholder: 'e.g. Customer Support Bot',
    voiceLabel: 'Voice',
    modelLabel: 'Gemini Live Model',
    promptLabel: 'System Prompt',
    promptPlaceholder: 'You are a helpful customer support agent for Acme Corp. Be friendly, professional, and concise in your responses...',
    validation: {
      requiredFields: 'Please fill in all fields',
    },
  },
  callPanel: {
    ready: 'Ready to call',
    connecting: 'Connecting...',
    connected: 'Connected',
    ended: 'Call ended',
    mute: 'Mute/Unmute',
    transcriptTitle: 'Live Transcript',
    transcriptEmpty: 'Transcription will appear here during the call...',
    roles: {
      user: '🎤 You',
      agent: '🤖 Agent',
    },
  },
  toasts: {
    loadAgentsFailed: 'Failed to load agents — check database connection',
    agentCreated: 'Agent created successfully',
    agentUpdated: 'Agent updated successfully',
    agentDeleted: 'Agent deleted',
    callStarted: (/** @type {string} */ name) => `Call started with ${name}`,
    connectionError: 'Connection error',
  },
  api: {
    errors: {
      fetchAgents: 'Failed to fetch agents',
      fetchAgent: 'Failed to fetch agent',
      agentNotFound: 'Agent not found',
      createAgent: 'Failed to create agent',
      updateAgent: 'Failed to update agent',
      deleteAgent: 'Failed to delete agent',
      requiredNamePrompt: 'Name and system prompt are required',
      invalidVoice: 'Invalid voice name',
      invalidModel: 'Invalid model name',
      invalidInput: 'Invalid request input',
      genericRequestFailed: 'Request failed',
    },
    success: {
      deleteAgent: 'Agent deleted successfully',
    },
  },
  signaling: {
    errors: {
      agentIdRequired: 'Agent ID is required',
      agentNotFound: 'Agent not found',
      geminiConnectFailed: 'Failed to connect to Gemini Live API. Check your API key and model name.',
      invalidMessageFormat: 'Invalid signaling message format',
      unknownMessageType: (/** @type {string} */ type) => `Unknown message type: ${type}`,
    },
    status: {
      geminiClosed: 'Gemini session closed',
      userEnded: 'User ended call',
    },
  },
};
