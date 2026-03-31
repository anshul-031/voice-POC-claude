const fs = require('fs');
const file = 'src/services/geminiLive.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `  private _handleMessage(`,
  `  private _handleMessage(
    sessionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
    onAudio?: (audio: string) => void,
    onTranscript?: (transcript: Transcript) => void,
    onInterrupted?: () => void,
  ): void {
    logger.info('RAW MSG', { keys: Object.keys(message), sample: JSON.stringify(message).substring(0, 100) });
    const entry = this.sessions.get(sessionId);
...`
);

// I'll just use replace_string_in_file.
