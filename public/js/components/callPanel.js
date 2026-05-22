/**
 * Reusable HTML template for the web call panel.
 */
/* eslint-disable max-len */

/**
 * @param {Object} options 
 * @param {boolean} [options.hideDetails=false]
 * @returns {string}
 */
export function renderCallPanelTemplate(options = {}) {
  const { hideDetails = false } = options;

  return `
    <div class="call-header">
      <button class="btn btn-ghost" id="btn-back-call">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        <span data-i18n="common.back">Back</span>
      </button>
      <h2 id="call-agent-name" data-i18n="${hideDetails ? 'preview.title' : 'agentList.title'}">${hideDetails ? 'Agent Web Call Preview' : 'Agent Name'}</h2>
      ${hideDetails ? '<div></div>' : '<div class="call-model-badge" id="call-model-badge"></div>'}
    </div>

    <div class="call-body-split">
      <!-- Left: Waveform + Controls -->
      <div class="call-left">
        <div class="visualizer-container" id="visualizer-container">
          <canvas id="waveform-canvas" width="350" height="170"></canvas>
          <div class="call-status" id="call-status" data-i18n="callPanel.ready">Ready to call</div>
          <div class="call-timer hidden" id="call-timer">00:00</div>
        </div>

        ${hideDetails ? '' : `
        <div class="call-voice-info" id="call-voice-info">
          <div class="voice-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
            <span id="call-voice-name">Puck</span>
          </div>
        </div>
        `}

        ${hideDetails ? '' : `
        <div class="outbound-call-section" id="outbound-call-section">
          <div class="outbound-call-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span data-i18n="callPanel.outbound.title">Outbound Call</span>
          </div>
          <div class="outbound-call-form">
            <input type="tel" id="outbound-phone-number" class="outbound-phone-input" placeholder="Enter phone number (e.g. +919876543210)" data-i18n-attr="placeholder:callPanel.outbound.phonePlaceholder" />
            <button class="btn btn-outbound-call" id="btn-outbound-call" data-i18n="callPanel.outbound.callBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span id="outbound-call-btn-text">Call via Phone</span>
            </button>
          </div>
          <div class="outbound-call-status hidden" id="outbound-call-status"></div>
        </div>
        <div class="call-separator" data-i18n="callPanel.outbound.separator">OR</div>
        `}

        <div class="call-controls-label">${hideDetails ? '' : '<span>Browser Call</span>'}</div>
        <div class="call-controls">
          <button class="btn-call btn-mute" id="btn-mute" data-i18n-attr="title:callPanel.mute" title="Mute/Unmute">
            <svg id="mute-icon-off" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            <svg id="mute-icon-on" class="hidden" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .67-.1 1.32-.27 1.93"/>
            </svg>
          </button>

          <button class="btn-call btn-phone" id="btn-call">
            <svg id="call-icon-start" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <svg id="call-icon-end" class="hidden" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M23.71 16.67C20.66 13.78 16.54 12 12 12S3.34 13.78.29 16.67c-.18.18-.29.43-.29.71s.11.53.29.71l2.48 2.48c.18.18.43.29.71.29s.53-.11.71-.29l2.79-2.79c.18-.18.29-.43.29-.71v-3.39c1.69-.64 3.53-1 5.43-1h.1c1.9 0 3.74.36 5.43 1v3.39c0 .28.11.53.29.71l2.79 2.79c.18.18.43.29.71.29s.53-.11.71-.29l2.48-2.48c.18-.18.29-.43.29-.71s-.11-.53-.29-.71z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Right: Live Transcript -->
      <div class="call-right">
        <div class="transcript-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span data-i18n="callPanel.transcriptTitle">Live Transcript</span>
        </div>
        <div class="transcript-body" id="transcript-body">
          <div class="transcript-empty" data-i18n="callPanel.transcriptEmpty">
            Transcription will appear here during the call...
          </div>
        </div>

        <div class="debug-log-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M10 2h4"/>
            <path d="M12 14v-4"/>
            <circle cx="12" cy="17" r="1"/>
            <path d="M12 22a8 8 0 1 0-8-8"/>
            <path d="M4 14H2"/>
          </svg>
          <span data-i18n="callPanel.debugTitle">Signaling Logs</span>
        </div>
        <div class="debug-log-body" id="debug-log-body">
          <div class="debug-log-empty" data-i18n="callPanel.debugEmpty">
            Runtime signaling logs will appear here during the call...
          </div>
        </div>
      </div>
    </div>
  `;
}
