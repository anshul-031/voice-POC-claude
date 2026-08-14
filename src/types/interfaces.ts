/**
 * TypeScript interfaces for the application.
 */

export interface WalletAccount {
  balance: number;
  costPerMinute: number;
  canStartCall: boolean;
}

export interface VoiceAgent {
  id: string;
  name: string;
  systemPrompt: string;
  voiceName: string;
  modelName: string;
  publicPreviewEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeminiSession {
  session: unknown;
  // Actually, let's use a more specific type if we can find it, or mark it as an interface.
  voiceName: string;
  model: string;
  correlationId?: string;
  startTime: number;
  audioChunksSent: number;
  audioChunksReceived: number;
  firstClientAudioAt?: number;
  firstModelAudioAt?: number;
  firstUserTranscriptAt?: number;
  firstModelTranscriptAt?: number;
  firstTextPromptAt?: number;
  lastAudioChunkSentAt?: number;
  firstResponseLatencyWarned?: boolean;
}

export interface SignalingClient {
  sessionId: string;
  agentId: string;
  correlationId?: string;
  streamId?: string;
  audioChunksRelayed: number;
  modelAudioChunksRelayed: number;
  startTime: number;
  firstModelAudioRelayedAt?: number;
  firstUserTranscriptRelayedAt?: number;
  firstModelTranscriptRelayedAt?: number;
  proactiveGreetingSent: boolean;
  proactiveGreetingSentAt?: number;
  lastModelResponseAt: number;
  lastUserAudioAt: number;
  nudgeCount: number;
  inactivityTimeoutMs: number;
  maxInactivityNudges: number;
  maxCallDurationSecs: number;
  inactivityTimer?: ReturnType<typeof setInterval>;
  callDurationTimer?: ReturnType<typeof setTimeout>;
  callType?: string;
  transcriptEntries?: Transcript[];
  transcriptOpenRole?: Transcript['role'];
  recordingChunks?: Buffer[];
  callHistoryFinalized?: boolean;
}

export interface Transcript {
  role: 'user' | 'model';
  text: string;
}

export interface AudioConfig {
  DEFAULT_MODEL: string;
  MIME_TYPE: string;
  SAMPLE_RATE_INPUT: number;
  SAMPLE_RATE_OUTPUT: number;
}

export interface TimeConstants {
  MS_TO_SEC: number;
  GEMINI_CONNECT_TIMEOUT_MS: number;
}

export interface RoutesConfig {
  API_PREFIX: string;
  WS_PATH: string;
  HEALTH_CHECK: string;
  RUNTIME_CONFIG: string;
  CONSTANTS_UI_STRINGS: string;
  CONSTANTS_CONFIG: string;
}

export interface RuntimeUiConfig {
  websiteName: string;
  theme: 'dark' | 'light';
}

export interface TelephonyProviderConfig {
  id: string;
  name: string;
  provider: string;
  direction: string;
  isActive: boolean;
  phoneNumber?: string | null;
  sipServer?: string | null;
  sipUsername?: string | null;
  sipPassword?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  accountSid?: string | null;
  authToken?: string | null;
  webhookUrl?: string | null;
  extraConfig?: string | null;
  /** Maximum simultaneous outbound calls allowed through this provider. */
  concurrencyLimit: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParsedCampaignContact {
  phoneNumber: string;
  variables: Record<string, string>;
}

export interface ParsedCampaignSpreadsheet {
  phoneColumn: string;
  variableColumns: string[];
  contacts: ParsedCampaignContact[];
}

export interface CampaignTriggerSummary {
  /** Contacts dialled in this pass — not the campaign's contact count. */
  total: number;
  initiated: number;
  failed: number;
  /**
   * Contacts left pending because the provider's concurrency limit was already
   * saturated. The scheduler dials them as slots free up.
   */
  queued: number;
}

/** Terminal outcome of a single campaign call, derived from a hangup callback. */
export interface CampaignCallOutcome {
  status: string;
  /** User-facing reason shown in the per-number status table. */
  detail: string | null;
}

/** The parts of a Vobiz hangup callback needed to resolve a campaign contact. */
export interface CampaignHangupReport {
  /** Present when the hangup URL was built by us (campaign calls). */
  contactId?: string | null;
  /** Provider call identifier, used when no contactId is carried. */
  callId?: string | null;
  hangupCause?: string | null;
  callStatus?: string | null;
  durationSecs: number;
}

/** Calendar fields of an instant as observed in a specific IANA timezone. */
export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** A campaign row as needed by the background scheduler. */
export interface SchedulableCampaign {
  id: string;
  agentId: string;
  providerId: string | null;
  userId: string;
  status: string;
  scheduledAt: Date | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** IANA zone the call window is expressed in. Null falls back to UTC. */
  timezone: string | null;
}

export interface CallHistoryAgentContext {
  id: string;
  name: string;
  userId: string | null;
}

export interface CreateCallRecordInput {
  sessionId: string;
  callType: string;
  agentId: string;
  agentName: string;
  userId: string | null;
  billingRate: number;
  phoneNumber?: string | null;
  direction?: string | null;
}

export interface StoredCallRecording {
  key: string;
  mimeType: string;
}

export interface FinalizeCallRecordInput {
  sessionId: string;
  status: string;
  durationSecs: number;
  transcript: Transcript[];
  recordingChunks?: Buffer[];
  recordingSampleRate?: number;
}
