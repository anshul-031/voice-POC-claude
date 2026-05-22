/**
 * Vobiz outbound calling service.
 *
 * Uses the Vobiz REST API to trigger outbound calls:
 *   POST https://api.vobiz.ai/api/v1/Account/{auth_id}/Call/
 *
 * Credentials come from the TelephonyProvider record in the database.
 */
import logger from '../utils/logger.js';

const VOBIZ_API_BASE = 'https://api.vobiz.ai/api/v1';
const VOBIZ_CALL_TIMEOUT_MS = 15000;

/**
 * Extracts a human-readable error message from a Vobiz API response.
 * Handles nested structures like `{ error: { message: "..." } }`.
 */
function extractErrorMessage(
  body: Record<string, unknown>,
  fallback: string,
): string {
  if (typeof body.message === 'string') return body.message;

  const err = body.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as Record<string, unknown>).message);
  }

  return fallback;
}

/**
 * Credentials needed to make a Vobiz API call.
 */
export interface VobizCredentials {
  authId: string;
  authToken: string;
  fromNumber: string;
}

/**
 * Response from the Vobiz Call API.
 */
export interface VobizCallResponse {
  success: boolean;
  callId?: string;
  errorMessage?: string;
  rawResponse?: Record<string, unknown>;
}

/**
 * Extracts Vobiz API credentials from a telephony provider record.
 *
 * Vobiz REST API uses Auth ID + Auth Token (NOT SIP credentials).
 * Priority: apiKey/authToken → sipUsername/sipPassword (fallback).
 */
export function extractVobizCredentials(
  provider: Record<string, unknown>,
): VobizCredentials | null {
  const authId = (provider.sipUsername || provider.apiKey) as string | null;
  const authToken = (provider.sipPassword || provider.authToken) as string | null;
  const fromNumber = provider.phoneNumber as string | null;

  if (!authId || !authToken || !fromNumber) {
    return null;
  }

  return { authId, authToken, fromNumber };
}

/**
 * Initiates an outbound call via the Vobiz REST API.
 */
export async function initiateVobizCall(
  creds: VobizCredentials,
  toNumber: string,
  answerUrl: string,
): Promise<VobizCallResponse> {
  const url = `${VOBIZ_API_BASE}/Account/${creds.authId}/Call/`;

  logger.info('Initiating Vobiz outbound call', {
    from: creds.fromNumber,
    to: toNumber,
    answerUrl,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(
    controller.abort.bind(controller),
    VOBIZ_CALL_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-ID': creds.authId,
        'X-Auth-Token': creds.authToken,
      },
      body: JSON.stringify({
        from: creds.fromNumber,
        to: toNumber,
        answer_url: answerUrl,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const body = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = extractErrorMessage(body, response.statusText);
      logger.error('Vobiz API returned error', {
        status: response.status,
        error: errMsg,
        body,
      });
      return {
        success: false,
        errorMessage: errMsg,
        rawResponse: body,
      };
    }

    const callId = (body.request_uuid || body.call_uuid || body.id) as string | undefined;

    logger.info('Vobiz call initiated successfully', {
      callId,
      from: creds.fromNumber,
      to: toNumber,
    });

    return {
      success: true,
      callId,
      rawResponse: body,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Vobiz API request failed', { error: errMsg });
    return {
      success: false,
      errorMessage: errMsg,
    };
  }
}
