const video = document.getElementById("video");
const statusText = document.getElementById("status");
const emotionText = document.getElementById("emotionText");
const cameraToggle = document.getElementById("cameraToggle");

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model";

let lastEmotion = "neutral";
let detectionTimer = null;
let isCameraRunning = false;
let modelsReady = false;

const emotionMap = {
  happy: "joy",
  sad: "sad",
  neutral: "neutral",
  angry: "angry",
};

const emotionLabel = {
  joy: "Rõõm / Улыбка",
  sad: "Kurbus / Грусть",
  neutral: "Neutraalne / Нейтрально",
  angry: "Viha / Злость",
};

function setStatus(text) {
  statusText.textContent = text;
}

function applyEmotion(emotion) {
  if (emotion === lastEmotion) {
    return;
  }

  document.body.classList.remove(
    "emotion-joy",
    "emotion-sad",
    "emotion-neutral",
    "emotion-angry",
  );
  document.body.classList.add(`emotion-${emotion}`);

  emotionText.textContent = emotionLabel[emotion] || emotion;
  lastEmotion = emotion;
}

function pickEmotion(expressions) {
  const candidates = ["happy", "sad", "neutral", "angry"];
  let top = "neutral";
  let topScore = -1;

  for (const name of candidates) {
    const score = expressions[name] ?? 0;
    if (score > topScore) {
      topScore = score;
      top = name;
    }
  }

  return emotionMap[top] || "neutral";
}

async function detectLoop() {
  if (!video.srcObject || !modelsReady) {
    return;
  }

  try {
    const result = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceExpressions();

    if (!result) {
      setStatus("Nägu ei ole kaadris / Лицо не найдено");
      return;
    }

    const emotion = pickEmotion(result.expressions);
    applyEmotion(emotion);
    setStatus("Kaamera töötab / Камера активна");
  } catch (error) {
    setStatus("Tuvastuse viga / Ошибка распознавания");
    console.error(error);
  }
}

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
}

function stopCamera() {
  if (detectionTimer) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }

  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  video.srcObject = null;
  isCameraRunning = false;
  cameraToggle.textContent = "Включить камеру";
  setStatus("Kaamera on välja lülitatud / Камера выключена");
}

async function startCamera() {
  await setupCamera();
  applyEmotion("neutral");
  detectionTimer = setInterval(detectLoop, 600);
  isCameraRunning = true;
  cameraToggle.textContent = "Выключить камеру";
  if (modelsReady) {
    setStatus("Kaamera töötab / Камера активна");
  } else {
    setStatus("Камера включена, но эмоции недоступны (модели не загружены)");
  }
}

async function toggleCamera() {
  cameraToggle.disabled = true;

  try {
    if (isCameraRunning) {
      stopCamera();
    } else {
      await startCamera();
    }
  } catch (error) {
    setStatus("Kaamera käivitamine ebaõnnestus / Не удалось включить камеру");
    console.error(error);
  } finally {
    cameraToggle.disabled = false;
  }
}

async function init() {
  cameraToggle.disabled = false;
  cameraToggle.addEventListener("click", toggleCamera);

  try {
    setStatus("Laen mudeleid... / Загружаю модели...");

    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    modelsReady = true;

    applyEmotion("neutral");
    setStatus("Valmis! Vajuta nuppu kaamera käivitamiseks / Нажмите кнопку для старта");
  } catch (error) {
    modelsReady = false;
    setStatus("Модели эмоций не загрузились. Камера доступна по кнопке.");
    console.error(error);
  }
}

window.addEventListener("beforeunload", () => {
  stopCamera();
});

init();
