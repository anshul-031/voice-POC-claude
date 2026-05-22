export function upsample8To16(pcm8Base64: string): string {
  const pcm8 = Buffer.from(pcm8Base64, 'base64');
  const outSamples = Math.floor(pcm8.length / 2);
  const pcm16 = Buffer.alloc(outSamples * 4); // 2 bytes per sample, duplicated = 4 bytes
  let pcm16Index = 0;
  for (let i = 0; i < outSamples * 2; i += 2) {
    const sample = pcm8.readInt16LE(i);
    pcm16.writeInt16LE(sample, pcm16Index);
    pcm16Index += 2;
    pcm16.writeInt16LE(sample, pcm16Index);
    pcm16Index += 2;
  }
  return pcm16.toString('base64');
}

export function downsample24To8(pcm24Base64: string): string {
  const pcm24 = Buffer.from(pcm24Base64, 'base64');
  // 24kHz to 8kHz = take 1 sample out of every 3
  // 1 sample = 2 bytes. So every 6 bytes of input gives 2 bytes of output
  const outSamples = Math.floor(pcm24.length / 6);
  const pcm8 = Buffer.alloc(outSamples * 2);
  let pcm8Index = 0;
  for (let i = 0; i < outSamples * 6; i += 6) {
    const sample = pcm24.readInt16LE(i);
    pcm8.writeInt16LE(sample, pcm8Index);
    pcm8Index += 2;
  }
  return pcm8.toString('base64');
}
