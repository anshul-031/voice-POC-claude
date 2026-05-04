import logger from '../../utils/logger.js';
import type { AriBridgeResponse, AriChannelResponse, AriConfig } from '../../types/index.js';

class AriClient {
  private readonly config: AriConfig;

  constructor(config: AriConfig) {
    this.config = config;
  }

  public async createBridge(): Promise<string> {
    const response = await this.request<AriBridgeResponse>('/bridges', {
      method: 'POST',
      query: { type: 'mixing' },
    });
    return response.id;
  }

  public async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
    await this.request<void>(`/bridges/${bridgeId}/addChannel`, {
      method: 'POST',
      query: { channel: channelId },
    });
  }

  public async createExternalMediaChannel(appName: string, host: string): Promise<string> {
    const response = await this.request<AriChannelResponse>('/channels/externalMedia', {
      method: 'POST',
      query: {
        app: appName,
        external_host: host,
        format: 'ulaw',
        direction: 'both',
      },
    });
    return response.id;
  }

  public async deleteBridge(bridgeId: string): Promise<void> {
    if (!bridgeId) {
      return;
    }
    await this.request<void>(`/bridges/${bridgeId}`, { method: 'DELETE' });
  }

  public async answerChannel(channelId: string): Promise<void> {
    if (!channelId) {
      return;
    }
    try {
      await this.request<void>(`/channels/${channelId}/answer`, { method: 'POST' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ARI request failed: 404')) {
        logger.warn('Channel already closed before answer', { channelId });
        return;
      }
      throw error;
    }
  }

  public async hangupChannel(channelId: string): Promise<void> {
    if (!channelId) {
      return;
    }
    try {
      await this.request<void>(`/channels/${channelId}`, { method: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ARI request failed: 404')) {
        logger.warn('Channel already closed', { channelId });
        return;
      }
      throw error;
    }
  }

  private async request<T>(
    path: string,
    options: { method: string; query?: Record<string, string>; body?: unknown },
  ): Promise<T> {
    const url = new URL(`/ari${path}`, this.resolveRestBaseUrl());
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: options.method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('ARI request failed', {
        path,
        status: response.status,
        body: text,
      });
      throw new Error(`ARI request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  private resolveRestBaseUrl(): string {
    const base = new URL(this.config.url);
    if (base.protocol === 'ws:') {
      base.protocol = 'http:';
    }
    if (base.protocol === 'wss:') {
      base.protocol = 'https:';
    }
    base.pathname = '/';
    base.search = '';
    base.hash = '';
    return base.toString();
  }
}

export default AriClient;
