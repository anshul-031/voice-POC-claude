import { describe, it, expect } from 'vitest';
import { upsample8To16, downsample24To8 } from '../utils/audioResampler.js';

describe('audioResampler', () => {
  it('upsamples 8kHz to 16kHz by duplicating samples', () => {
    // 2 samples: 0x0100, 0x0200
    const inputBuf = Buffer.alloc(4);
    inputBuf.writeInt16LE(1, 0);
    inputBuf.writeInt16LE(2, 2);
    
    const outputBase64 = upsample8To16(inputBuf.toString('base64'));
    const outputBuf = Buffer.from(outputBase64, 'base64');
    
    // Should be 4 samples: 0x0100, 0x0100, 0x0200, 0x0200
    expect(outputBuf.length).toBe(8);
    expect(outputBuf.readInt16LE(0)).toBe(1);
    expect(outputBuf.readInt16LE(2)).toBe(1);
    expect(outputBuf.readInt16LE(4)).toBe(2);
    expect(outputBuf.readInt16LE(6)).toBe(2);
  });

  it('downsamples 24kHz to 8kHz by dropping 2 out of 3 samples', () => {
    // 3 samples: 0x0100, 0x0200, 0x0300
    const inputBuf = Buffer.alloc(6);
    inputBuf.writeInt16LE(1, 0);
    inputBuf.writeInt16LE(2, 2);
    inputBuf.writeInt16LE(3, 4);
    
    const outputBase64 = downsample24To8(inputBuf.toString('base64'));
    const outputBuf = Buffer.from(outputBase64, 'base64');
    
    // Should be 1 sample: 0x0100
    expect(outputBuf.length).toBe(2);
    expect(outputBuf.readInt16LE(0)).toBe(1);
  });

  it('handles partial sample sequences safely in downsample', () => {
    // 4 samples: 1, 2, 3, 4 (8 bytes, not a multiple of 6)
    const inputBuf = Buffer.alloc(8);
    inputBuf.writeInt16LE(1, 0);
    inputBuf.writeInt16LE(2, 2);
    inputBuf.writeInt16LE(3, 4);
    inputBuf.writeInt16LE(4, 6);
    
    const outputBase64 = downsample24To8(inputBuf.toString('base64'));
    const outputBuf = Buffer.from(outputBase64, 'base64');
    
    // Floor(8/6) = 1 output sample. Just 1.
    expect(outputBuf.length).toBe(2);
    expect(outputBuf.readInt16LE(0)).toBe(1);
  });

  it('handles empty inputs', () => {
    expect(upsample8To16('')).toBe('');
    expect(downsample24To8('')).toBe('');
  });
});
