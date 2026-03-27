const startBtn = document.getElementById('startBtn');
const testSoundBtn = document.getElementById('testSoundBtn');
const muteBtn = document.getElementById('muteBtn');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const cameraStatus = document.getElementById('cameraStatus');
const movementLabel = document.getElementById('movementLabel');
const confidenceLabel = document.getElementById('confidenceLabel');
const detectorStatus = document.getElementById('detectorStatus');
const eventLog = document.getElementById('eventLog');

const ctx = overlay.getContext('2d');
const processingCanvas = document.createElement('canvas');
const processingCtx = processingCanvas.getContext('2d', { willReadFrequently: true });

let audioContext = null;
let stream = null;
let prevGray = null;
let prevCentroid = null;
let prevBoxArea = null;
let isMuted = false;
let lastTriggerTs = 0;

// Small processing resolution keeps frame analysis fast on most devices.
const PROC_WIDTH = 160;
const PROC_HEIGHT = 120;
const PIXEL_DIFF_THRESHOLD = 28;
const MIN_MOTION_PIXELS = 500;
const MOVEMENT_COOLDOWN_MS = 700;

const directionLabels = {
  left: 'Влево',
  right: 'Вправо',
  up: 'Вверх',
  down: 'Вниз',
  forward: 'Вперед',
  backward: 'Назад (ТРЕВОГА)'
};

const directionSounds = {
  left: { type: 'sawtooth', freq: 280, duration: 0.17 },
  right: { type: 'triangle', freq: 460, duration: 0.17 },
  up: { type: 'square', freq: 620, duration: 0.13 },
  down: { type: 'sine', freq: 220, duration: 0.24 },
  forward: { type: 'triangle', freq: 760, duration: 0.12 },
  backward: { type: 'sawtooth', freq: 170, duration: 0.4 }
};

function logEvent(message, severity = 'ok') {
  const item = document.createElement('li');
  item.classList.add(severity);
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;

  eventLog.prepend(item);

  while (eventLog.children.length > 14) {
    eventLog.removeChild(eventLog.lastChild);
  }
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return audioContext.state === 'running';
}

async function playSound(direction) {
  if (isMuted || !directionSounds[direction]) {
    return;
  }

  const isAudioReady = await ensureAudioContext();
  if (!isAudioReady) {
    logEvent('Браузер заблокировал звук. Нажмите "Тест звука".', 'alert');
    return;
  }

  const cfg = directionSounds[direction];
  const now = audioContext.currentTime;

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.type = cfg.type;
  osc.frequency.setValueAtTime(cfg.freq, now);

  // ADSR-like envelope removes harsh clicks and sounds more intentional.
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(direction === 'backward' ? 0.28 : 0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.duration);

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.start(now);
  osc.stop(now + cfg.duration + 0.03);

  // Backward movement is critical: play an extra short pulse as alarm emphasis.
  if (direction === 'backward') {
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();

    osc2.type = 'square';
    osc2.frequency.setValueAtTime(130, now + 0.08);
    gain2.gain.setValueAtTime(0.001, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.34);
  }
}

function getGrayFrame() {
  processingCtx.drawImage(video, 0, 0, PROC_WIDTH, PROC_HEIGHT);
  const frame = processingCtx.getImageData(0, 0, PROC_WIDTH, PROC_HEIGHT);
  const gray = new Uint8Array(PROC_WIDTH * PROC_HEIGHT);

  for (let i = 0, j = 0; i < frame.data.length; i += 4, j += 1) {
    const r = frame.data[i];
    const g = frame.data[i + 1];
    const b = frame.data[i + 2];
    gray[j] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  }

  return gray;
}

function detectMotionDirection(grayNow) {
  if (!prevGray) {
    prevGray = grayNow;
    return null;
  }

  let motionCount = 0;
  let sumX = 0;
  let sumY = 0;

  let minX = PROC_WIDTH;
  let minY = PROC_HEIGHT;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < PROC_HEIGHT; y += 1) {
    for (let x = 0; x < PROC_WIDTH; x += 1) {
      const idx = y * PROC_WIDTH + x;
      const diff = Math.abs(grayNow[idx] - prevGray[idx]);

      if (diff > PIXEL_DIFF_THRESHOLD) {
        motionCount += 1;
        sumX += x;
        sumY += y;

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  prevGray = grayNow;

  if (motionCount < MIN_MOTION_PIXELS) {
    prevCentroid = null;
    prevBoxArea = null;
    return null;
  }

  const centroid = {
    x: sumX / motionCount,
    y: sumY / motionCount
  };

  const boxW = Math.max(1, maxX - minX);
  const boxH = Math.max(1, maxY - minY);
  const boxArea = boxW * boxH;

  if (!prevCentroid || !prevBoxArea) {
    prevCentroid = centroid;
    prevBoxArea = boxArea;
    return null;
  }

  const dx = centroid.x - prevCentroid.x;
  const dy = centroid.y - prevCentroid.y;
  const areaRatio = boxArea / prevBoxArea;

  prevCentroid = centroid;
  prevBoxArea = boxArea;

  // Confidence is a normalized score from motion intensity and movement size.
  const motionStrength = Math.min(1, motionCount / 3000);
  const shiftStrength = Math.min(1, (Math.abs(dx) + Math.abs(dy)) / 18);
  const confidence = Math.round((motionStrength * 0.55 + shiftStrength * 0.45) * 100);

  const lateralThreshold = 2.2;
  const verticalThreshold = 2.2;

  // If contour shrinks quickly, the object likely goes farther from the camera.
  if (areaRatio < 0.88) {
    return { direction: 'backward', confidence, centroid };
  }

  // If contour grows quickly, the object likely moves toward the camera.
  if (areaRatio > 1.12) {
    return { direction: 'forward', confidence, centroid };
  }

  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > lateralThreshold) {
    return { direction: dx > 0 ? 'right' : 'left', confidence, centroid };
  }

  if (Math.abs(dy) > verticalThreshold) {
    return { direction: dy > 0 ? 'down' : 'up', confidence, centroid };
  }

  return null;
}

function drawOverlay(result) {
  const width = overlay.width;
  const height = overlay.height;

  ctx.clearRect(0, 0, width, height);

  if (!result) {
    return;
  }

  const x = (result.centroid.x / PROC_WIDTH) * width;
  const y = (result.centroid.y / PROC_HEIGHT) * height;

  ctx.fillStyle = 'rgba(255, 107, 53, 0.85)';
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(30, 203, 225, 0.95)';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 35, y - 35, 70, 70);
}

function processFrame() {
  if (!stream) {
    return;
  }

  const gray = getGrayFrame();
  const result = detectMotionDirection(gray);
  drawOverlay(result);

  if (result) {
    const now = performance.now();

    if (now - lastTriggerTs > MOVEMENT_COOLDOWN_MS) {
      lastTriggerTs = now;
      movementLabel.textContent = directionLabels[result.direction];
      confidenceLabel.textContent = `${result.confidence}%`;
      detectorStatus.textContent = result.direction === 'backward' ? 'Тревога' : 'Обнаружено';

      const severity = result.direction === 'backward' ? 'alert' : 'ok';
      logEvent(`Движение: ${directionLabels[result.direction]} (${result.confidence}%)`, severity);
      playSound(result.direction);
    }
  }

  requestAnimationFrame(processFrame);
}

async function startCamera() {
  if (stream) {
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });

    video.srcObject = stream;

    await video.play();

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    processingCanvas.width = PROC_WIDTH;
    processingCanvas.height = PROC_HEIGHT;

    cameraStatus.textContent = 'Камера активна';
    detectorStatus.textContent = 'Сканирование';
    logEvent('Камера запущена. Детектор активирован.', 'ok');
    processFrame();
  } catch (error) {
    cameraStatus.textContent = 'Ошибка доступа к камере';
    detectorStatus.textContent = 'Ошибка';
    logEvent(`Ошибка камеры: ${error.message}`, 'alert');
  }
}

startBtn.addEventListener('click', async () => {
  const isAudioReady = await ensureAudioContext();
  if (isAudioReady) {
    // Play a short confirmation beep inside a user gesture to unlock audio on strict browsers.
    await playSound('forward');
    logEvent('Звук активирован.', 'ok');
  } else {
    logEvent('Не удалось активировать звук в браузере.', 'alert');
  }

  await startCamera();
});

testSoundBtn.addEventListener('click', async () => {
  await playSound('right');
  logEvent('Тест звука выполнен.', 'ok');
});

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? 'Включить звук' : 'Выключить звук';
  logEvent(isMuted ? 'Звук отключен пользователем.' : 'Звук включен пользователем.', 'ok');
});
