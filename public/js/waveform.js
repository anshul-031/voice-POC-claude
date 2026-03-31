/**
 * Waveform visualization logic for the frontend.
 */

/** @type {HTMLCanvasElement | null} */
let waveformCanvas;
/** @type {CanvasRenderingContext2D | null} */
let waveformCtx;
/** @type {number | null} */
let animFrameId;

/**
 * @returns {void}
 */
export function initWaveform() {
  const canvas = document.getElementById('waveform-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  waveformCanvas = canvas;
  waveformCtx = waveformCanvas.getContext('2d');
  drawIdleWaveform();
}

/**
 * @returns {void}
 */
export function drawIdleWaveform() {
  if (!waveformCtx || !waveformCanvas) return;
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

/**
 * @param {AnalyserNode} analyserNode 
 * @returns {void}
 */
export function startWaveformAnimation(analyserNode) {
  function draw() {
    if (!analyserNode || !waveformCtx || !waveformCanvas) return;
    const canvas = /** @type {HTMLCanvasElement} */ (waveformCanvas);
    const ctx = /** @type {CanvasRenderingContext2D} */ (waveformCtx);

    const { width, height } = canvas;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const barWidth = (width / bufferLength) * 2;

    // Background gradient
    const bgGrad = ctx.createRadialGradient(width / 2, centerY, 20, width / 2, centerY, width / 2);
    bgGrad.addColorStop(0, 'rgba(124, 58, 237, 0.04)');
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Draw frequency bars from center
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * (height * 0.4);
      const x = i * barWidth;

      // Gradient for each bar
      const gradient = ctx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight);
      gradient.addColorStop(0, `rgba(124, 58, 237, ${0.6 + (dataArray[i] / 255) * 0.4})`);
      gradient.addColorStop(0.5, `rgba(139, 92, 246, ${0.4 + (dataArray[i] / 255) * 0.4})`);
      gradient.addColorStop(1, `rgba(6, 182, 212, ${0.6 + (dataArray[i] / 255) * 0.4})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight * 2);

      // Glow effect for louder bars
      if (dataArray[i] > 150) {
        ctx.shadowColor = 'rgba(124, 58, 237, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight * 2);
        ctx.shadowBlur = 0;
      }
    }

    animFrameId = requestAnimationFrame(draw);
  }

  draw();
}

/**
 * @returns {void}
 */
export function stopWaveformAnimation() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  // Draw idle state
  setTimeout(() => drawIdleWaveform(), 100);
}
