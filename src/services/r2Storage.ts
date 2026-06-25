/**
 * Cloudflare R2 object-store service (S3-compatible).
 *
 * Wraps the AWS S3 SDK pointed at an R2 endpoint. All call recordings are
 * stored here. When R2 is not configured (see src/constants/config.ts), the
 * service degrades gracefully: uploads are skipped and signed URLs are null,
 * so calls keep working without recording storage.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2_CONFIG } from '../constants/config.js';
import logger from '../utils/logger.js';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const R2_REGION = 'auto';

let cachedClient: S3Client | null = null;

/** Whether R2 storage is configured and usable. */
export function isR2Configured(): boolean {
  return R2_CONFIG !== null;
}

/** Lazily build (and cache) the S3 client targeting the R2 endpoint. */
function getClient(): S3Client | null {
  if (!R2_CONFIG) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: R2_REGION,
      endpoint: R2_CONFIG.endpoint,
      credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey,
      },
    });
  }
  return cachedClient;
}

/**
 * Upload a recording buffer to R2.
 * @returns the stored object key, or null when R2 is not configured / upload failed.
 */
export async function uploadRecording(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string | null> {
  const client = getClient();
  if (!client || !R2_CONFIG) {
    logger.warn('R2 not configured — skipping recording upload', { key });
    return null;
  }

  try {
    await client.send(new PutObjectCommand({
      Bucket: R2_CONFIG.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    logger.info('Recording uploaded to R2', { key, bytes: body.length, contentType });
    return key;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to upload recording to R2', { key, error: errMsg });
    return null;
  }
}

/**
 * Build a time-limited signed URL to download/play a stored recording.
 * @returns a signed URL, or null when R2 is not configured / signing failed.
 */
export async function getSignedRecordingUrl(
  key: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const client = getClient();
  if (!client || !R2_CONFIG) {
    return null;
  }

  try {
    const command = new GetObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key });
    return await getSignedUrl(client, command, { expiresIn });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to sign recording URL', { key, error: errMsg });
    return null;
  }
}

/** Best-effort delete of a stored recording. Never throws. */
export async function deleteRecording(key: string): Promise<void> {
  const client = getClient();
  if (!client || !R2_CONFIG) {
    return;
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key }));
    logger.info('Recording deleted from R2', { key });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to delete recording from R2', { key, error: errMsg });
  }
}

/** Reset the cached client (test helper). @internal */
export function resetR2Client(): void {
  cachedClient = null;
}
