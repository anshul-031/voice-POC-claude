/* ============================================
   VoiceForge — Frontend Application Logic
   Agent CRUD, WebSocket Audio, Waveform Viz
   ============================================ */

// ── State ──
console.log('[VoiceForge] 🚀 App initializing...');
let agents = [];
let voices = [];
let models = [];
let selectedAgentId = null;
let currentCallAgentId = null;
let isInCall = false;
let isMuted = false;
let callTimer = null;
let callSeconds = 0;

// Audio
let audioContext = null;
let mediaStream = null;
let audioProcessor = null;
let ws = null;
let analyserNode = null;
let animFrameId = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadVoices();
  loadModels();
  loadAgents();
  checkApiHealth();
  initWaveform();
});

// ── API Helpers ──
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function checkApiHealth() {
  const dot = document.getElementById('api-status');
  const text = document.getElementById('api-status-text');
  try {
    await api('/health');
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
  } catch {
    dot.className = 'status-dot error';
    text.textContent = 'Disconnected';
  }
}

// ── Voices ──
async function loadVoices() {
  try {
    voices = await api('/voices');
    renderVoiceGrid();
  } catch (err) {
    console.error('Failed to load voices:', err);
  }
}

function renderVoiceGrid() {
  const grid = document.getElementById('voice-grid');
  grid.innerHTML = voices.map(v => `
    <label class="voice-option${v.id === 'Puck' ? ' selected' : ''}" data-voice="${v.id}">
      <input type="radio" name="voiceName" value="${v.id}" ${v.id === 'Puck' ? 'checked' : ''}>
      <div class="voice-option-name">${v.name}</div>
      <div class="voice-option-desc">${v.description}</div>
    </label>
  `).join('');

  // Click handlers
  grid.querySelectorAll('.voice-option').forEach(opt => {
    opt.addEventListener('click', () => {
      grid.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
    });
  });
}

// ── Models ──
async function loadModels() {
  try {
    models = await api('/models');
    renderModelSelect();
  } catch (err) {
    console.error('Failed to load models:', err);
  }
}

function renderModelSelect() {
  const select = document.getElementById('form-model');
  select.innerHTML = models.map(m => `
    <option value="${m.id}">${m.name} — ${m.description}</option>
  `).join('');
}

// ── Agents ──
async function loadAgents() {
  try {
    agents = await api('/agents');
    renderAgentList();
  } catch (err) {
    console.error('Failed to load agents:', err);
    showToast('Failed to load agents — check database connection', 'error');
    agents = [];
    renderAgentList();
  }
}

function renderAgentList() {
  const list = document.getElementById('agent-list');

  if (agents.length === 0) {
    list.innerHTML = `
      <div class="agent-list-empty">
        <p>No agents yet. Click <strong>"New Agent"</strong> to create your first voice agent.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = agents.map(agent => `
    <div class="agent-card${agent.id === selectedAgentId ? ' active' : ''}" data-id="${agent.id}" onclick="selectAgent('${agent.id}')">
      <div class="agent-card-header">
        <span class="agent-card-name">${escapeHtml(agent.name)}</span>
        <span class="agent-card-voice">${escapeHtml(agent.voiceName)}</span>
      </div>
      <div class="agent-card-prompt">${escapeHtml(agent.systemPrompt)}</div>
      <div class="agent-card-actions">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); showCallPanel('${agent.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
          Test Call
        </button>
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); editAgent('${agent.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteAgent('${agent.id}')">Delete</button>
      </div>
      <div class="agent-card-date">${new Date(agent.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
    </div>
  `).join('');
}

function selectAgent(id) {
  selectedAgentId = id;
  renderAgentList();
  editAgent(id);
}

// ── Create / Edit Form ──
function showCreateForm() {
  document.getElementById('form-agent-id').value = '';
  document.getElementById('form-name').value = '';
  document.getElementById('form-prompt').value = '';
  document.getElementById('form-title').textContent = 'Create New Agent';
  document.getElementById('form-submit-text').textContent = 'Create Agent';

  // Reset voice selection to Puck
  const grid = document.getElementById('voice-grid');
  grid.querySelectorAll('.voice-option').forEach(o => {
    o.classList.remove('selected');
    if (o.dataset.voice === 'Puck') {
      o.classList.add('selected');
      o.querySelector('input').checked = true;
    }
  });

  // Reset model to default
  const modelSelect = document.getElementById('form-model');
  if (modelSelect.options.length > 0) {
    modelSelect.selectedIndex = 0;
  }

  showPanel('form');
}

function editAgent(id) {
  const agent = agents.find(a => a.id === id);
  if (!agent) return;

  document.getElementById('form-agent-id').value = agent.id;
  document.getElementById('form-name').value = agent.name;
  document.getElementById('form-prompt').value = agent.systemPrompt;
  document.getElementById('form-title').textContent = 'Edit Agent';
  document.getElementById('form-submit-text').textContent = 'Save Changes';

  // Set voice selection
  const grid = document.getElementById('voice-grid');
  grid.querySelectorAll('.voice-option').forEach(o => {
    o.classList.remove('selected');
    if (o.dataset.voice === agent.voiceName) {
      o.classList.add('selected');
      o.querySelector('input').checked = true;
    }
  });

  // Set model selection
  const modelSelect = document.getElementById('form-model');
  if (agent.modelName) {
    modelSelect.value = agent.modelName;
  }

  showPanel('form');
}

async function handleSubmit(event) {
  event.preventDefault();

  const id = document.getElementById('form-agent-id').value;
  const name = document.getElementById('form-name').value.trim();
  const systemPrompt = document.getElementById('form-prompt').value.trim();
  const voiceRadio = document.querySelector('input[name="voiceName"]:checked');
  const voiceName = voiceRadio ? voiceRadio.value : 'Puck';
  const modelName = document.getElementById('form-model').value;

  if (!name || !systemPrompt) {
    showToast('Please fill in all fields', 'error');
    return;
  }

  try {
    if (id) {
      await api(`/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, systemPrompt, voiceName, modelName }),
      });
      showToast('Agent updated successfully', 'success');
    } else {
      await api('/agents', {
        method: 'POST',
        body: JSON.stringify({ name, systemPrompt, voiceName, modelName }),
      });
      showToast('Agent created successfully', 'success');
    }

    await loadAgents();
    hideForm();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAgent(id) {
  const agent = agents.find(a => a.id === id);
  if (!agent) return;

  if (!confirm(`Delete "${agent.name}"? This cannot be undone.`)) return;

  try {
    await api(`/agents/${id}`, { method: 'DELETE' });
    showToast('Agent deleted', 'success');
    if (selectedAgentId === id) {
      selectedAgentId = null;
      showPanel('empty');
    }
    await loadAgents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Panel Switching ──
function showPanel(panel) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('agent-form-container').classList.add('hidden');
  document.getElementById('call-panel').classList.add('hidden');

  switch (panel) {
    case 'empty':
      document.getElementById('empty-state').classList.remove('hidden');
      break;
    case 'form':
      document.getElementById('agent-form-container').classList.remove('hidden');
      break;
    case 'call':
      document.getElementById('call-panel').classList.remove('hidden');
      break;
  }
}

function hideForm() {
  showPanel('empty');
}

function hideCallPanel() {
  if (isInCall) {
    endCall();
  }
  showPanel('empty');
}

// ── Voice Call (WebSocket Audio Relay) ──
function showCallPanel(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  currentCallAgentId = agentId;
  document.getElementById('call-agent-name').textContent = agent.name;
  document.getElementById('call-voice-name').textContent = agent.voiceName;
  document.getElementById('call-model-badge').textContent = agent.modelName || 'default';
  document.getElementById('call-status').textContent = 'Ready to call';
  document.getElementById('call-status').className = 'call-status';
  document.getElementById('call-timer').classList.add('hidden');
  clearTranscript();

  console.log(`[VoiceForge] 📞 Call panel opened | agent="${agent.name}" | voice=${agent.voiceName} | model=${agent.modelName}`);

  resetCallUI();
  showPanel('call');
}

async function toggleCall() {
  if (isInCall) {
    endCall();
  } else {
    await startCall();
  }
}

async function startCall() {
  if (!currentCallAgentId) return;

  const statusEl = document.getElementById('call-status');
  const timerEl = document.getElementById('call-timer');
  const btnCall = document.getElementById('btn-call');

  statusEl.textContent = 'Connecting...';
  statusEl.className = 'call-status connecting';
  console.log('[VoiceForge] 🔌 Starting call...');

  try {
    // 1. Get microphone access
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });

    // 2. Setup analyser for waveform visualization
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    startWaveformAnimation();
    console.log('[VoiceForge] 🎙️ Microphone access granted, audio pipeline setup complete');

    // 3. Setup audio processor (ScriptProcessorNode for wider compatibility)
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);

    audioProcessor.onaudioprocess = (event) => {
      if (!isInCall || isMuted) return;

      const inputData = event.inputBuffer.getChannelData(0);
      // Convert float32 to int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Convert to base64
      const uint8 = new Uint8Array(pcm16.buffer);
      const base64 = uint8ToBase64(uint8);

      // Send to server
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'audio-data', data: base64 }));
      }
    };

    // 4. Connect WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      // Start call
      ws.send(JSON.stringify({ type: 'start-call', agentId: currentCallAgentId }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWsMessage(message);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      showToast('Connection error', 'error');
      endCall();
    };

    ws.onclose = () => {
      if (isInCall) {
        endCall();
      }
    };

  } catch (err) {
    console.error('Failed to start call:', err);
    showToast(`Failed to start call: ${err.message}`, 'error');
    endCall();
  }
}

function handleWsMessage(message) {
  switch (message.type) {
    case 'call-started':
      isInCall = true;
      updateCallUI(true);
      document.getElementById('call-status').textContent = 'Connected';
      document.getElementById('call-status').className = 'call-status active';
      document.getElementById('call-timer').classList.remove('hidden');
      startTimer();
      console.log(`[VoiceForge] ✅ Call connected | session=${message.sessionId} | agent="${message.agentName}" | model=${message.modelName}`);
      showToast(`Call started with ${message.agentName}`, 'success');
      break;

    case 'audio-response':
      playAudioResponse(message.data);
      break;

    case 'transcript':
      console.log(`[VoiceForge] 💬 Transcript | ${message.role}: "${message.text}"`);
      addTranscript(message.role, message.text);
      break;

    case 'interrupted':
      console.log('[VoiceForge] ⚡ Model interrupted');
      break;

    case 'call-ended':
      console.log(`[VoiceForge] 📴 Call ended: ${message.reason}`);
      showToast(message.reason || 'Call ended', 'success');
      endCall();
      break;

    case 'error':
      console.error(`[VoiceForge] ❌ Error: ${message.message}`);
      showToast(message.message, 'error');
      endCall();
      break;
  }
}

// ── Audio Playback ──
const audioQueue = [];
let isPlayingAudio = false;

function playAudioResponse(base64Data) {
  audioQueue.push(base64Data);
  if (!isPlayingAudio) {
    processAudioQueue();
  }
}

async function processAudioQueue() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    return;
  }

  isPlayingAudio = true;
  const base64Data = audioQueue.shift();

  try {
    if (!audioContext || audioContext.state === 'closed') return;

    // Decode base64 to PCM bytes
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert int16 PCM to float32 at 24kHz (Gemini output sample rate)
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // Create audio buffer at 24kHz
    const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const bufferSource = audioContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(audioContext.destination);

    // Also connect to analyser for visualization
    if (analyserNode) {
      bufferSource.connect(analyserNode);
    }

    bufferSource.onended = () => {
      processAudioQueue();
    };

    bufferSource.start();
  } catch (err) {
    console.error('Error playing audio:', err);
    processAudioQueue();
  }
}

function endCall() {
  isInCall = false;

  // Send end-call message
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'end-call' }));
    ws.close();
  }
  ws = null;

  // Stop audio
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
  }
  audioContext = null;
  analyserNode = null;

  // Clear audio queue
  audioQueue.length = 0;
  isPlayingAudio = false;

  // Stop timer
  stopTimer();

  // Update UI
  updateCallUI(false);
  document.getElementById('call-status').textContent = 'Call ended';
  document.getElementById('call-status').className = 'call-status';

  stopWaveformAnimation();
  isMuted = false;
  console.log('[VoiceForge] 🛑 Call ended, all resources cleaned up');
}

// ── Transcript ──
function clearTranscript() {
  const body = document.getElementById('transcript-body');
  body.innerHTML = '<div class="transcript-empty">Transcription will appear here during the call...</div>';
}

function addTranscript(role, text) {
  if (!text || !text.trim()) return;

  const body = document.getElementById('transcript-body');

  // Remove empty placeholder
  const empty = body.querySelector('.transcript-empty');
  if (empty) empty.remove();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const msgDiv = document.createElement('div');
  msgDiv.className = `transcript-msg ${role}`;
  msgDiv.innerHTML = `
    <div class="transcript-role">${role === 'user' ? '🎤 You' : '🤖 Agent'}</div>
    <div class="transcript-bubble">${escapeHtml(text)}</div>
    <div class="transcript-time">${timeStr}</div>
  `;

  body.appendChild(msgDiv);
  body.scrollTop = body.scrollHeight;
}

// ── Mute ──
function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('btn-mute');
  const iconOff = document.getElementById('mute-icon-off');
  const iconOn = document.getElementById('mute-icon-on');

  if (isMuted) {
    btn.classList.add('muted');
    iconOff.classList.add('hidden');
    iconOn.classList.remove('hidden');
  } else {
    btn.classList.remove('muted');
    iconOff.classList.remove('hidden');
    iconOn.classList.add('hidden');
  }
}

// ── Call Timer ──
function startTimer() {
  callSeconds = 0;
  updateTimerDisplay();
  callTimer = setInterval(() => {
    callSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
}

function updateTimerDisplay() {
  const mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
  const secs = (callSeconds % 60).toString().padStart(2, '0');
  document.getElementById('call-timer').textContent = `${mins}:${secs}`;
}

// ── Call UI State ──
function updateCallUI(active) {
  const btnCall = document.getElementById('btn-call');
  const iconStart = document.getElementById('call-icon-start');
  const iconEnd = document.getElementById('call-icon-end');

  if (active) {
    btnCall.classList.add('active');
    iconStart.classList.add('hidden');
    iconEnd.classList.remove('hidden');
  } else {
    btnCall.classList.remove('active');
    iconStart.classList.remove('hidden');
    iconEnd.classList.add('hidden');
  }
}

function resetCallUI() {
  updateCallUI(false);
  isMuted = false;
  const btn = document.getElementById('btn-mute');
  btn.classList.remove('muted');
  document.getElementById('mute-icon-off').classList.remove('hidden');
  document.getElementById('mute-icon-on').classList.add('hidden');
}

// ── Waveform Visualizer ──
let waveformCanvas, waveformCtx;

function initWaveform() {
  waveformCanvas = document.getElementById('waveform-canvas');
  waveformCtx = waveformCanvas.getContext('2d');
  drawIdleWaveform();
}

function drawIdleWaveform() {
  if (!waveformCtx) return;
  const { width, height } = waveformCanvas;

  waveformCtx.clearRect(0, 0, width, height);

  // Draw idle circular lines
  const centerX = width / 2;
  const centerY = height / 2;
  const time = Date.now() * 0.001;

  // Background gradient
  const bgGrad = waveformCtx.createRadialGradient(centerX, centerY, 20, centerX, centerY, 120);
  bgGrad.addColorStop(0, 'rgba(124, 58, 237, 0.08)');
  bgGrad.addColorStop(1, 'rgba(6, 182, 212, 0.02)');
  waveformCtx.fillStyle = bgGrad;
  waveformCtx.fillRect(0, 0, width, height);

  // Draw orbiting circles
  for (let ring = 0; ring < 3; ring++) {
    const radius = 30 + ring * 25;
    const alpha = 0.15 - ring * 0.04;
    waveformCtx.beginPath();
    waveformCtx.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
    waveformCtx.lineWidth = 1.5;

    for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
      const wobble = Math.sin(angle * 3 + time + ring) * 3;
      const x = centerX + Math.cos(angle) * (radius + wobble);
      const y = centerY + Math.sin(angle) * (radius + wobble);
      if (angle === 0) {
        waveformCtx.moveTo(x, y);
      } else {
        waveformCtx.lineTo(x, y);
      }
    }
    waveformCtx.closePath();
    waveformCtx.stroke();
  }
}

function startWaveformAnimation() {
  function draw() {
    if (!analyserNode || !waveformCtx) return;

    const { width, height } = waveformCanvas;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    waveformCtx.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const barWidth = (width / bufferLength) * 2;

    // Background gradient
    const bgGrad = waveformCtx.createRadialGradient(width / 2, centerY, 20, width / 2, centerY, width / 2);
    bgGrad.addColorStop(0, 'rgba(124, 58, 237, 0.04)');
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    waveformCtx.fillStyle = bgGrad;
    waveformCtx.fillRect(0, 0, width, height);

    // Draw frequency bars from center
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * (height * 0.4);
      const x = i * barWidth;

      // Gradient for each bar
      const gradient = waveformCtx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight);
      gradient.addColorStop(0, `rgba(124, 58, 237, ${0.6 + (dataArray[i] / 255) * 0.4})`);
      gradient.addColorStop(0.5, `rgba(139, 92, 246, ${0.4 + (dataArray[i] / 255) * 0.4})`);
      gradient.addColorStop(1, `rgba(6, 182, 212, ${0.6 + (dataArray[i] / 255) * 0.4})`);

      waveformCtx.fillStyle = gradient;
      waveformCtx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight * 2);

      // Glow effect for louder bars
      if (dataArray[i] > 150) {
        waveformCtx.shadowColor = 'rgba(124, 58, 237, 0.5)';
        waveformCtx.shadowBlur = 8;
        waveformCtx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight * 2);
        waveformCtx.shadowBlur = 0;
      }
    }

    animFrameId = requestAnimationFrame(draw);
  }

  draw();
}

function stopWaveformAnimation() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  // Draw idle state
  setTimeout(() => drawIdleWaveform(), 100);
}

// ── Toast Notifications ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Utility ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function uint8ToBase64(uint8Array) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
