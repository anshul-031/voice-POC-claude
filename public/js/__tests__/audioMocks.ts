/**
 * Shared Web Audio doubles for the playback and scheduler suites.
 */
import { vi } from 'vitest';

export type MockGain = { gain: any; connect: any; disconnect: any };

export function createMockGain(withAutomation = true): MockGain {
  const gain: any = { value: 1 };
  if (withAutomation) {
    gain.setValueAtTime = vi.fn();
    gain.linearRampToValueAtTime = vi.fn();
    gain.cancelScheduledValues = vi.fn();
  }
  return { gain, connect: vi.fn(), disconnect: vi.fn() };
}

export function createMockContext(
  overrides: any = {},
  gainFactory: () => MockGain = () => createMockGain(),
) {
  const sources: any[] = [];
  const gains: MockGain[] = [];
  const channels: Float32Array[] = [];

  const context: any = {
    state: 'running',
    currentTime: 0,
    sampleRate: 24000,
    destination: {},
    createGain: vi.fn(() => {
      const node = gainFactory();
      gains.push(node);
      return node;
    }),
    createBuffer: vi.fn((_channelCount: number, length: number) => {
      const data = new Float32Array(length);
      channels.push(data);
      return { length, duration: length / 24000, getChannelData: () => data };
    }),
    createBufferSource: vi.fn(() => {
      const node: any = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      sources.push(node);
      return node;
    }),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
  };

  Object.assign(context, overrides);
  return { context, sources, gains, channels };
}

export function loudSamples(length: number): Float32Array {
  return new Float32Array(length).fill(1);
}
