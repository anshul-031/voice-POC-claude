import logger from '../../utils/logger.js';
import type { Socket } from 'dgram';
import type { AriConfig } from '../../types/index.js';

export async function bindRtpSocket(socket: Socket, config: AriConfig): Promise<number> {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const port = reservePort(config);
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          socket.off('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          socket.off('error', onError);
          resolve();
        };
        socket.once('error', onError);
        socket.once('listening', onListening);
        socket.bind(port);
      });
      logger.info('RTP socket bound', { port });
      return port;
    } catch (error) {
      logger.warn('Failed to bind RTP port, retrying', {
        attempt,
        error: (error as Error).message,
      });
    }
  }

  throw new Error('Failed to bind RTP port after retries');
}

function reservePort(config: AriConfig): number {
  const range = config.rtpPortMax - config.rtpPortMin;
  return config.rtpPortMin + Math.floor(Math.random() * (range + 1));
}
