const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const emotionLabel = document.getElementById("emotion");
const confidenceLabel = document.getElementById("confidence");
const hint = document.getElementById("hint");
const videoWrap = document.getElementById("videoWrap");
const startCameraButton = document.getElementById("startCamera");
const toggleDetectButton = document.getElementById("toggleDetect");
const snapshotButton = document.getElementById("snapshot");
const fullscreenButton = document.getElementById("fullscreen");

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

let detectTimer = null;
let currentEmotion = "neutral";
let modelsReady = false;
let detectionPaused = false;
let cameraStarting = false;
let cameraReady = false;

const expressionMap = {
  happy: "happy",
  sad: "sad",
  neutral: "neutral",
  angry: "angry"
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setControlsEnabled(enabled) {
  if (toggleDetectButton) {
    toggleDetectButton.disabled = !enabled;
  }

  if (snapshotButton) {
    snapshotButton.disabled = !enabled;
  }

  if (fullscreenButton) {
    fullscreenButton.disabled = !enabled;
  }
}

function getUserMediaCompat(constraints) {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  const legacyGetUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  if (!legacyGetUserMedia) {
    return Promise.reject(new Error("getUserMedia is not supported"));
  }

  return new Promise((resolve, reject) => {
    legacyGetUserMedia.call(navigator, constraints, resolve, reject);
  });
}

function cameraErrorMessage(error) {
  if (!error || !error.name) {
    return "Unknown camera error.";
  }

  const extra = error.message ? ` (${error.message})` : "";

  switch (error.name) {
    case "AbortError":
      return `Camera start was interrupted. Close apps using camera and try again.${extra}`;
    case "NotAllowedError":
      return `Camera permission denied. Allow camera access in browser settings and reload.${extra}`;
    case "NotFoundError":
      return `No camera device found.${extra}`;
    case "NotReadableError":
      return `Camera is busy in another app. Close Zoom/Discord/Teams and retry.${extra}`;
    case "OverconstrainedError":
      return `Requested camera profile is not supported on this device.${extra}`;
    case "NotSupportedError":
      return `Camera is not supported in this launch mode. Open via localhost or HTTPS.${extra}`;
    case "SecurityError":
      return `Camera access requires HTTPS or localhost.${extra}`;
    default:
      return `Camera error: ${error.name}${extra}`;
  }
}

function stopCamera() {
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  video.srcObject = null;
}

async function getVideoInputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput");
  } catch (error) {
    console.warn("Could not enumerate video inputs:", error);
    return [];
  }
}

async function waitForVideoReady(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error("No video track in media stream");
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  await new Promise((resolve, reject) => {
    let settled = false;

    const done = (cb, payload) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("canplay", onReady);
      cb(payload);
    };

    const onReady = async () => {
      try {
        await video.play();
        done(resolve);
      } catch (error) {
        // If stream is already live, treat this as success.
        if (track.readyState === "live") {
          done(resolve);
          return;
        }

        done(reject, error);
      }
    };

    const timeoutId = setTimeout(() => {
      if (track.readyState === "live") {
        done(resolve);
        return;
      }

      done(reject, new Error("Video start timeout"));
    }, 7000);

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("canplay", onReady);

    if (video.readyState >= 1) {
      onReady();
    }
  });
}

async function openCameraStream() {
  const attempts = [
    { video: true, audio: false },
    {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    },
    {
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 960 },
        height: { ideal: 540 }
      },
      audio: false
    }
  ];

  const devices = await getVideoInputDevices();
  for (const device of devices) {
    attempts.push({
      video: {
        deviceId: { exact: device.deviceId }
      },
      audio: false
    });
  }

  let lastError = null;

  for (const constraints of attempts) {
    try {
      const stream = await getUserMediaCompat(constraints);
      await waitForVideoReady(stream);
      return stream;
    } catch (error) {
      lastError = error;

      if (error && error.name === "AbortError") {
        await delay(350);
      }
    }
  }

  throw lastError || new Error("Unable to access camera");
}

async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
  ]);

  modelsReady = true;
}

function pickEmotion(expressions) {
  const candidates = Object.entries(expressions)
    .filter(([name]) => expressionMap[name])
    .sort((a, b) => b[1] - a[1]);

  if (!candidates.length) {
    return { name: "neutral", confidence: 0 };
  }

  const [topName, topScore] = candidates[0];
  return {
    name: expressionMap[topName],
    confidence: topScore
  };
}

function setEmotionState(name, confidence) {
  if (currentEmotion !== name) {
    document.body.dataset.emotion = name;
    currentEmotion = name;
  }

  emotionLabel.textContent = name;
  confidenceLabel.textContent = `${Math.round(confidence * 100)}%`;
}

function clearOverlay() {
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
}

function drawFaceBox(detection) {
  const dims = faceapi.matchDimensions(overlay, video, true);
  const resized = faceapi.resizeResults(detection, dims);

  clearOverlay();

  const ctx = overlay.getContext("2d");
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";

  const box = resized.detection.box;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
}

async function detectEmotionLoop() {
  if (!modelsReady) {
    return;
  }

  if (detectTimer) {
    clearInterval(detectTimer);
  }

  detectTimer = setInterval(async () => {
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();

      if (!detection) {
        setEmotionState("neutral", 0);
        clearOverlay();
        return;
      }

      if (detectionPaused) {
        return;
      }

      drawFaceBox(detection);

      const emotion = pickEmotion(detection.expressions);
      setEmotionState(emotion.name, emotion.confidence);
    } catch (error) {
      console.error("Emotion detection error:", error);
    }
  }, 280);
}

function toggleDetectionPause() {
  detectionPaused = !detectionPaused;

  if (toggleDetectButton) {
    toggleDetectButton.textContent = detectionPaused
      ? "Resume Detection"
      : "Pause Detection";
  }

  hint.textContent = detectionPaused
    ? "Detection paused. Camera stays active."
    : "Detection resumed. Show your expression to change the background.";
}

function takeSnapshot() {
  if (!video.videoWidth || !video.videoHeight) {
    hint.textContent = "Camera is not ready for snapshot yet.";
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `emotion-snapshot-${Date.now()}.png`;
  link.click();

  hint.textContent = "Snapshot saved.";
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await videoWrap.requestFullscreen();

      if (fullscreenButton) {
        fullscreenButton.textContent = "Exit Fullscreen";
      }

      return;
    }

    await document.exitFullscreen();

    if (fullscreenButton) {
      fullscreenButton.textContent = "Fullscreen";
    }
  } catch (error) {
    console.error(error);
    hint.textContent = "Fullscreen is not available in this browser mode.";
  }
}

async function init() {
  if (cameraStarting) {
    return;
  }

  const hasAnyGetUserMedia =
    (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ||
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

  const inEmbeddedFrame = (() => {
    try {
      return window.self !== window.top;
    } catch (_error) {
      return true;
    }
  })();

  if (inEmbeddedFrame) {
    hint.textContent =
      "Embedded preview detected. Trying to start camera; if blocked, open http://localhost:4173 in Chrome/Edge.";
  }

  if (!hasAnyGetUserMedia) {
    hint.textContent = "Camera API is not supported in this browser.";
    return;
  }

  if (!window.isSecureContext) {
    const runningFromFile = window.location.protocol === "file:";
    hint.textContent = runningFromFile
      ? "Camera is blocked in file mode. Run this page via localhost (for example, Live Server)."
      : "Open this app on HTTPS or localhost to use the camera.";
    return;
  }

  cameraStarting = true;
  setControlsEnabled(false);

  if (startCameraButton) {
    startCameraButton.disabled = true;
    startCameraButton.textContent = "Starting...";
  }

  try {
    stopCamera();

    hint.textContent = "Starting camera...";
    await openCameraStream();
    cameraReady = true;

    hint.textContent = "Camera active. Loading emotion models...";

    if (!modelsReady) {
      await loadModels();
    }

    hint.textContent = "Camera active. Show your expression to change the background.";
    await detectEmotionLoop();
    setControlsEnabled(true);
  } catch (error) {
    console.error(error);
    hint.textContent = cameraErrorMessage(error);
    setControlsEnabled(false);
    cameraReady = false;
  } finally {
    cameraStarting = false;

    if (startCameraButton) {
      startCameraButton.disabled = false;
      startCameraButton.textContent = cameraReady ? "Restart Camera" : "Start Camera";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  if (startCameraButton) {
    startCameraButton.addEventListener("click", init);
  }

  setControlsEnabled(false);
  hint.textContent = "Press Start Camera to begin.";

  if (toggleDetectButton) {
    toggleDetectButton.addEventListener("click", toggleDetectionPause);
  }

  if (snapshotButton) {
    snapshotButton.addEventListener("click", takeSnapshot);
  }

  if (fullscreenButton) {
    fullscreenButton.addEventListener("click", toggleFullscreen);
  }

  document.addEventListener("fullscreenchange", () => {
    if (fullscreenButton && !document.fullscreenElement) {
      fullscreenButton.textContent = "Fullscreen";
    }
  });
});

window.addEventListener("beforeunload", () => {
  if (detectTimer) {
    clearInterval(detectTimer);
  }

  stopCamera();
});
