/**
 * JSDoc type definitions for the application.
 */

/**
 * @typedef {Object} VoiceAgent
 * @property {string} id
 * @property {string} name
 * @property {string} systemPrompt
 * @property {string} voiceName
 * @property {string} modelName
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {Object} GeminiSession
 * @property {any} session - The live connection session
 * @property {string} voiceName
 * @property {string} model
 * @property {number} startTime
 * @property {number} audioChunksSent
 * @property {number} audioChunksReceived
 */

/**
 * @typedef {Object} SignalingClient
 * @property {string} sessionId
 * @property {string} agentId
 * @property {number} audioChunksRelayed
 * @property {number} startTime
 */

/**
 * @typedef {Object} Transcript
 * @property {'user' | 'model'} role
 * @property {string} text
 */

export {};
