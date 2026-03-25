const photoInput = document.getElementById("photoInput");
const analyzeButton = document.getElementById("analyzeButton");
const variationButton = document.getElementById("variationButton");
const saveButton = document.getElementById("saveButton");
const exportButton = document.getElementById("exportButton");
const stopButton = document.getElementById("stopButton");
const previewImage = document.getElementById("previewImage");
const analysisCanvas = document.getElementById("analysisCanvas");
const visualizerCanvas = document.getElementById("visualizerCanvas");
const dropZone = document.getElementById("dropZone");
const palette = document.getElementById("palette");
const objectsList = document.getElementById("objectsList");
const musicMeta = document.getElementById("musicMeta");
const favoritesList = document.getElementById("favoritesList");
const statusText = document.getElementById("statusText");
const stylePreset = document.getElementById("stylePreset");
const energySlider = document.getElementById("energySlider");
const complexitySlider = document.getElementById("complexitySlider");
const reverbSlider = document.getElementById("reverbSlider");
const fastModeToggle = document.getElementById("fastModeToggle");
const energyValue = document.getElementById("energyValue");
const complexityValue = document.getElementById("complexityValue");
const reverbValue = document.getElementById("reverbValue");

let selectedFileUrl = "";
let cocoModel = null;
let activeParts = [];
let activeSynths = [];
let activeEffects = [];
let activeAnalyzer = null;
let visualizationFrame = 0;
let currentAnalysis = null;
let variationCounter = 0;
let favorites = loadFavorites();
let imageLoadToken = 0;
let latestImageLoad = Promise.resolve();
let isCurrentImageReady = false;
let analysisRunId = 0;
let playbackQueue = Promise.resolve();
let currentPlaybackId = 0;
const DETECTION_MAX_SIZE = 640;
const DETECTION_TIMEOUT_MS = 6000;
const FAVORITES_KEY = "musical-portrait-favorites-v1";

const styleDefaults = {
  cinematic: { energy: 60, complexity: 55, reverb: 45 },
  chill: { energy: 42, complexity: 48, reverb: 35 },
  arcade: { energy: 84, complexity: 67, reverb: 20 },
  organic: { energy: 54, complexity: 62, reverb: 40 }
};

photoInput.addEventListener("change", handleFileChange);
analyzeButton.addEventListener("click", () => {
  primeAudioFromGesture();
  void analyzeAndPlay();
});
variationButton.addEventListener("click", () => {
  primeAudioFromGesture();
  void generateVariation();
});
saveButton.addEventListener("click", saveCurrentTrack);
exportButton.addEventListener("click", exportCurrentAnalysis);
stopButton.addEventListener("click", stopPlayback);
stylePreset.addEventListener("change", applyStyleDefaults);

energySlider.addEventListener("input", () => updateSliderLabel(energySlider, energyValue));
complexitySlider.addEventListener("input", () => updateSliderLabel(complexitySlider, complexityValue));
reverbSlider.addEventListener("input", () => updateSliderLabel(reverbSlider, reverbValue));

dropZone.addEventListener("dragover", handleDragOver);
dropZone.addEventListener("dragleave", handleDragLeave);
dropZone.addEventListener("drop", handleDrop);

document.addEventListener("keydown", handleKeyboardShortcuts);

applyStyleDefaults();
renderFavorites();
startVisualizerLoop();

if ("requestIdleCallback" in window) {
  window.requestIdleCallback(() => {
    void loadCocoModel();
  }, { timeout: 2500 });
} else {
  setTimeout(() => {
    void loadCocoModel();
  }, 800);
}

function setStatus(message) {
  statusText.textContent = message;
}

function handleFileChange(event) {
  const [file] = event.target.files || [];
  setImageFile(file);
  // Reset input so selecting the same file again still triggers change.
  event.target.value = "";
}

function setImageFile(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("Please choose an image file.");
    return;
  }

  const nextUrl = URL.createObjectURL(file);
  const previousUrl = selectedFileUrl;
  const token = ++imageLoadToken;
  const runId = ++analysisRunId;
  isCurrentImageReady = false;
  analyzeButton.disabled = true;
  stopPlayback();

  previewImage.style.display = "block";
  setStatus("Loading photo...");

  latestImageLoad = (async () => {
    try {
      await loadImageIntoPreview(previewImage, nextUrl, token);
      if (token !== imageLoadToken) {
        URL.revokeObjectURL(nextUrl);
        return;
      }

      selectedFileUrl = nextUrl;
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      isCurrentImageReady = true;
      if (runId === analysisRunId) {
        analyzeButton.disabled = false;
      }
      void loadCocoModel();
      currentAnalysis = null;
      variationCounter = 0;
      setStatus("Photo uploaded. Click 'Analyze and Play'.");
    } catch {
      if (token !== imageLoadToken) {
        URL.revokeObjectURL(nextUrl);
        return;
      }

      URL.revokeObjectURL(nextUrl);
      isCurrentImageReady = false;
      if (runId === analysisRunId) {
        analyzeButton.disabled = true;
      }
      setStatus("Could not load this image. Try another file.");
    }
  })();
}

function handleDragOver(event) {
  event.preventDefault();
  dropZone.classList.add("dragover");
}

function handleDragLeave() {
  dropZone.classList.remove("dragover");
}

function handleDrop(event) {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  const [file] = event.dataTransfer?.files || [];
  setImageFile(file);
}

function handleKeyboardShortcuts(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void analyzeAndPlay();
  }

  if (event.key.toLowerCase() === "v") {
    event.preventDefault();
    void generateVariation();
  }

  if (event.code === "Space") {
    event.preventDefault();
    stopPlayback();
    setStatus("Playback stopped.");
  }
}

function updateSliderLabel(slider, label) {
  label.textContent = slider.value;
}

function applyStyleDefaults() {
  const preset = styleDefaults[stylePreset.value] || styleDefaults.cinematic;
  energySlider.value = String(preset.energy);
  complexitySlider.value = String(preset.complexity);
  reverbSlider.value = String(preset.reverb);
  updateSliderLabel(energySlider, energyValue);
  updateSliderLabel(complexitySlider, complexityValue);
  updateSliderLabel(reverbSlider, reverbValue);
}

function getUserSettings() {
  return {
    style: stylePreset.value,
    energy: Number(energySlider.value),
    complexity: Number(complexitySlider.value),
    reverb: Number(reverbSlider.value),
    fastMode: fastModeToggle.checked
  };
}

async function analyzeAndPlay() {
  if (!previewImage.src) {
    setStatus("Upload a photo first.");
    return;
  }

  const runId = ++analysisRunId;
  analyzeButton.disabled = true;

  try {
    await ensureAudioReady();
    await latestImageLoad;
    if (!isCurrentImageReady) {
      setStatus("Image is still loading. Please try again.");
      return;
    }

    const imageTokenAtStart = imageLoadToken;

    const settings = getUserSettings();
    setStatus("Running quick color analysis...");
    await ensureImageLoaded(previewImage);

    if (runId !== analysisRunId || imageTokenAtStart !== imageLoadToken) {
      return;
    }

    const colorProfile = extractColorProfile(previewImage, analysisCanvas);
    let detections = [];
    if (!settings.fastMode) {
      setStatus("Detecting objects...");
      detections = await withTimeout(detectObjects(previewImage), DETECTION_TIMEOUT_MS, []);
      if (runId !== analysisRunId || imageTokenAtStart !== imageLoadToken) {
        return;
      }
    }

    const composition = buildComposition(colorProfile, detections, settings, Date.now());

    currentAnalysis = {
      colorProfile,
      detections,
      composition,
      source: "photo"
    };

    renderAnalysis(colorProfile, detections, composition);
    await queueAndPlayComposition(composition);
    if (runId !== analysisRunId || imageTokenAtStart !== imageLoadToken) {
      return;
    }

    setStatus(`♫ Track playing at ${composition.tempo} BPM. Press Stop or upload another photo.`);
  } catch (error) {
    console.error(error);
    setStatus("Could not analyze the photo. Try a different image.");
  } finally {
    if (runId === analysisRunId && isCurrentImageReady) {
      analyzeButton.disabled = false;
    }
  }
}

async function generateVariation() {
  if (!currentAnalysis) {
    await analyzeAndPlay();
    return;
  }

  await ensureAudioReady();

  variationCounter += 1;
  const settings = getUserSettings();
  const seed = Date.now() + variationCounter * 77;
  const composition = buildComposition(currentAnalysis.colorProfile, currentAnalysis.detections, settings, seed);

  currentAnalysis = {
    ...currentAnalysis,
    composition,
    source: "variation"
  };

  renderAnalysis(currentAnalysis.colorProfile, currentAnalysis.detections, composition);
  await queueAndPlayComposition(composition);
  setStatus("Variation generated from the same image profile.");
}

function saveCurrentTrack() {
  if (!currentAnalysis) {
    setStatus("Analyze an image before saving.");
    return;
  }

  const item = {
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
    summary: `${currentAnalysis.composition.mood} / ${currentAnalysis.composition.tempo} BPM`,
    composition: currentAnalysis.composition,
    colorProfile: currentAnalysis.colorProfile,
    detections: currentAnalysis.detections
  };

  favorites = [item, ...favorites].slice(0, 12);
  persistFavorites();
  renderFavorites();
  setStatus("Track saved to favorites.");
}

function exportCurrentAnalysis() {
  if (!currentAnalysis) {
    setStatus("Nothing to export yet.");
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    ...currentAnalysis
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `musical-portrait-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Analysis exported as JSON.");
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function renderFavorites() {
  favoritesList.innerHTML = "";

  if (favorites.length === 0) {
    const empty = document.createElement("li");
    empty.className = "favorite-meta";
    empty.textContent = "No favorites yet.";
    favoritesList.appendChild(empty);
    return;
  }

  for (const item of favorites) {
    const li = document.createElement("li");
    li.className = "favorites-item";

    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "favorite-title";
    title.textContent = new Date(item.createdAt).toLocaleString();
    const meta = document.createElement("div");
    meta.className = "favorite-meta";
    meta.textContent = item.summary;
    titleWrap.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "favorite-actions";

    const replayBtn = document.createElement("button");
    replayBtn.className = "mini-btn";
    replayBtn.textContent = "Replay";
    replayBtn.addEventListener("click", async () => {
      await ensureAudioReady();
      currentAnalysis = {
        colorProfile: item.colorProfile,
        detections: item.detections,
        composition: item.composition,
        source: "favorite"
      };
      renderAnalysis(item.colorProfile, item.detections, item.composition);
      await queueAndPlayComposition(item.composition);
      setStatus("Replaying favorite track.");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "mini-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      favorites = favorites.filter((f) => f.id !== item.id);
      persistFavorites();
      renderFavorites();
    });

    actions.append(replayBtn, deleteBtn);
    li.append(titleWrap, actions);
    favoritesList.appendChild(li);
  }
}

function ensureImageLoaded(image) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onLoad = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      resolve();
    };

    const onError = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      reject(new Error("Image loading failed"));
    };

    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
  });
}

function loadImageIntoPreview(image, src, token) {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      if (token !== imageLoadToken) {
        reject(new Error("Stale image load"));
        return;
      }
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Preview image loading failed"));
    };

    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };

    image.addEventListener("load", onLoad);
    image.addEventListener("error", onError);
    image.src = src;
  });
}

function extractColorProfile(image, canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const sampleSize = 96;

  canvas.width = sampleSize;
  canvas.height = sampleSize;
  ctx.drawImage(image, 0, 0, sampleSize, sampleSize);

  const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let brightnessSum = 0;
  let saturationSum = 0;

  const bins = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    rSum += r;
    gSum += g;
    bSum += b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const bright = (r + g + b) / (3 * 255);

    saturationSum += sat;
    brightnessSum += bright;

    const key = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  const pixels = data.length / 4;
  const avgColor = {
    r: Math.round(rSum / pixels),
    g: Math.round(gSum / pixels),
    b: Math.round(bSum / pixels)
  };

  const dominantColors = [...bins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(",").map(Number);
      return { r, g, b };
    });

  const hsl = rgbToHsl(avgColor.r, avgColor.g, avgColor.b);

  return {
    avgColor,
    dominantColors,
    brightness: brightnessSum / pixels,
    saturation: saturationSum / pixels,
    hue: hsl.h
  };
}

async function detectObjects(image) {
  const model = await loadCocoModel();
  const canvas = document.createElement("canvas");
  const { width, height } = getScaledDimensions(image.naturalWidth, image.naturalHeight, DETECTION_MAX_SIZE);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  ctx.drawImage(image, 0, 0, width, height);

  const predictions = await model.detect(canvas, 10);
  return predictions.filter((item) => item.score >= 0.5);
}

async function loadCocoModel() {
  if (cocoModel) {
    return cocoModel;
  }

  cocoModel = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  return cocoModel;
}

function getScaledDimensions(width, height, maxSize) {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const scale = Math.min(maxSize / width, maxSize / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function withTimeout(promise, timeoutMs, fallbackValue) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
}

function buildComposition(colorProfile, detections, settings, seed) {
  const { hue, brightness, saturation, dominantColors } = colorProfile;
  const rng = createRng(seed);
  const baseTempo = Math.round(58 + saturation * 48 + brightness * 20 + settings.energy * 0.7);
  const tempo = clamp(baseTempo, 60, 168);

  const scale = pickScaleFromHue(hue, rng);
  const density = clamp(Math.round(detections.length / 2) + Math.round(settings.complexity / 25), 2, 9);

  const objectClasses = detections.map((d) => d.class);
  const uniqueClasses = [...new Set(objectClasses)];

  const objectWeight = uniqueClasses.length === 0 ? 1 : uniqueClasses.length;
  const progression = createChordProgression(scale, objectWeight, settings, rng);
  const motif = createMelodicMotif(scale, density, dominantColors.length || 3, rng, settings.style);
  const drumPattern = createDrumPattern(brightness, detections.length, settings.energy, rng, settings.style);

  return {
    tempo,
    scale,
    style: settings.style,
    energy: settings.energy,
    complexity: settings.complexity,
    reverb: settings.reverb,
    fastMode: settings.fastMode,
    detections,
    progression,
    motif,
    drumPattern,
    density,
    mood: describeMood(hue, brightness, saturation),
    seed
  };
}

function pickScaleFromHue(hue, rng) {
  const scaleFamilies = [
    [["C4", "D4", "E4", "G4", "A4"], ["C4", "D#4", "F4", "G4", "A#4"]],
    [["D4", "F4", "G4", "A4", "C5"], ["D4", "E4", "G4", "A4", "B4"]],
    [["E4", "G4", "A4", "B4", "D5"], ["E4", "F#4", "A4", "B4", "C#5"]],
    [["A3", "C4", "D4", "E4", "G4"], ["A3", "B3", "D4", "E4", "F#4"]],
    [["F4", "G4", "A#4", "C5", "D5"], ["F4", "G4", "A4", "C5", "D5"]],
    [["G3", "A#3", "C4", "D4", "F4"], ["G3", "A3", "C4", "D4", "E4"]]
  ];

  const index = clamp(Math.floor(hue / 60), 0, scaleFamilies.length - 1);
  const options = scaleFamilies[index];
  const selected = options[Math.floor(rng() * options.length)];

  const shift = rng() > 0.75 ? 1 : rng() < 0.15 ? -1 : 0;
  return selected.map((note) => shiftNoteOctave(note, shift));
}

function createChordProgression(scale, objectWeight, settings, rng) {
  const roots = [scale[0], scale[1], scale[2], scale[4]];
  const count = clamp(objectWeight + 1 + Math.floor(settings.complexity / 50), 3, 6);
  const progression = [];

  for (let i = 0; i < count; i += 1) {
    const root = roots[(i + Math.floor(rng() * roots.length)) % roots.length];
    const third = scale[(i + 2 + Math.floor(rng() * 2)) % scale.length];
    const fifth = scale[(i + 4 + Math.floor(rng() * 2)) % scale.length] || scale[1];
    progression.push([
      normalizePlayableNote(root, 4),
      normalizePlayableNote(third, 4),
      normalizePlayableNote(fifth, 4)
    ]);
  }

  return progression;
}

function createMelodicMotif(scale, density, paletteSize, rng, style) {
  const motifLength = clamp(density + paletteSize, 4, 12);
  const rhythmPools = {
    cinematic: ["8n", "4n", "8n", "16n", "8n", "4n"],
    chill: ["4n", "8n", "8n", "4n", "8n"],
    arcade: ["16n", "8n", "16n", "8n", "8n", "16n"],
    organic: ["8n", "8n", "4n", "8n", "4n", "8n"]
  };
  const rhythm = rhythmPools[style] || rhythmPools.cinematic;

  const motif = [];
  for (let i = 0; i < motifLength; i += 1) {
    const isRest = rng() > 0.82;
    motif.push({
      note: isRest ? null : scale[(i + Math.floor(rng() * scale.length)) % scale.length],
      duration: rhythm[i % rhythm.length],
      velocity: clamp(0.42 + ((i % 3) * 0.13) + rng() * 0.18, 0.35, 0.95)
    });
  }

  return motif;
}

function createDrumPattern(brightness, detectionCount, energy, rng, style) {
  const hatsEvery = brightness > 0.55 || energy > 70 ? "8n" : "4n";
  const kickEvery = detectionCount >= 3 || energy > 78 ? "2n" : "1n";
  const snareOptions = [
    ["0:2", "1:2"],
    ["0:2", "1:0:2", "1:2"],
    ["0:1:2", "1:2"]
  ];
  const kickNoteOptions = style === "arcade" ? ["C1", "G1", "A1"] : ["C1", "D1", "G1"];
  const hatOpenChance = style === "organic" ? 0.22 : 0.1;

  return {
    hatsEvery,
    kickEvery,
    snareOn: snareOptions[Math.floor(rng() * snareOptions.length)],
    kickNotes: kickNoteOptions,
    hatOpenChance
  };
}

async function queueAndPlayComposition(composition) {
  const playId = ++currentPlaybackId;
  playbackQueue = playbackQueue.then(async () => {
    if (playId !== currentPlaybackId) {
      return;
    }
    await playComposition(composition);
  });
  await playbackQueue;
}

async function playComposition(composition) {
  stopPlayback();
  await wait(40);
  await ensureAudioReady();
  Tone.Transport.cancel(0);

  Tone.Transport.bpm.value = composition.tempo;

  const master = new Tone.Gain(0.9).toDestination();
  const reverb = new Tone.Reverb({ decay: 1.8 + composition.reverb / 32, wet: composition.reverb / 100 });
  reverb.connect(master);

  const styleToOsc = {
    cinematic: "triangle",
    chill: "sine",
    arcade: "square",
    organic: "sawtooth"
  };
  const padOsc = styleToOsc[composition.style] || "triangle";

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: padOsc },
    envelope: { attack: 0.35, release: 1.2 }
  }).connect(reverb);

  const lead = new Tone.Synth({
    oscillator: { type: composition.style === "arcade" ? "pulse" : "sawtooth" },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.6 }
  }).connect(reverb);

  const bass = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.03, decay: 0.2, sustain: 0.4, release: 0.25 }
  }).connect(master);

  const kick = new Tone.MembraneSynth().connect(master);
  const hat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.005, decay: 0.09, sustain: 0 }
  }).connect(master);

  const chordPart = new Tone.Sequence(
    (time, chord) => {
      pad.triggerAttackRelease(chord, "1n", time, 0.35);
    },
    composition.progression,
    "1n"
  ).start(0);

  const leadPart = new Tone.Part((time, event) => {
    if (event.note) {
      const safeLeadNote = normalizePlayableNote(event.note, 4);
      lead.triggerAttackRelease(safeLeadNote, event.duration, time, event.velocity);
    }
  });

  const bassPart = new Tone.Sequence(
    (time, chord) => {
      const root = normalizePlayableNote(chord[0], 2).replace(/\d$/, "2");
      bass.triggerAttackRelease(root, "8n", time, 0.42);
    },
    composition.progression,
    "2n"
  ).start(0);

  let cursor = 0;
  for (const note of composition.motif) {
    leadPart.add(cursor, note);
    cursor += Tone.Time(note.duration).toSeconds();
  }
  leadPart.loop = true;
  leadPart.loopEnd = cursor;
  leadPart.start(0);

  const hatLoop = new Tone.Loop((time) => {
    const hatDuration = Math.random() < composition.drumPattern.hatOpenChance ? "8n" : "16n";
    hat.triggerAttackRelease(hatDuration, time, 0.14 + Math.random() * 0.1);
  }, composition.drumPattern.hatsEvery).start(0);

  let kickStep = 0;
  const kickLoop = new Tone.Loop((time) => {
    const rawNote = composition.drumPattern.kickNotes[kickStep % composition.drumPattern.kickNotes.length];
    const note = normalizePlayableNote(rawNote, 1);
    kick.triggerAttackRelease(note, "8n", time, 0.74 + Math.random() * 0.2);
    kickStep += 1;
  }, composition.drumPattern.kickEvery).start(0);

  const snarePart = new Tone.Part((time) => {
    hat.triggerAttackRelease("16n", time, 0.3);
  }, composition.drumPattern.snareOn).start(0);
  snarePart.loop = true;
  snarePart.loopEnd = "2m";

  activeAnalyzer = new Tone.Analyser("waveform", 256);
  master.connect(activeAnalyzer);

  activeSynths = [pad, lead, bass, kick, hat];
  activeEffects = [master, reverb, activeAnalyzer];
  activeParts = [chordPart, leadPart, bassPart, hatLoop, kickLoop, snarePart];

  await startTransportSafely();
}

async function ensureAudioReady() {
  await Tone.start();
  if (Tone.context.state !== "running") {
    await Tone.context.resume();
  }
}

function primeAudioFromGesture() {
  // Fire and forget in the click stack to satisfy autoplay policy.
  void Tone.start();
  if (Tone.context.state !== "running") {
    void Tone.context.resume();
  }
}

async function startTransportSafely() {
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  Tone.Transport.start();

  await wait(220);
  const stalled = Tone.context.state !== "running" || Tone.Transport.state !== "started";

  if (!stalled) {
    return;
  }

  await ensureAudioReady();
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  Tone.Transport.start();
  await wait(180);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stopPlayback() {
  cancelAnimationFrame(visualizationFrame);

  try {
    for (const part of activeParts) {
      safeStopDispose(part);
    }
  } catch {}

  try {
    for (const synth of activeSynths) {
      safeDispose(synth);
    }
  } catch {}

  try {
    for (const fx of activeEffects) {
      safeDispose(fx);
    }
  } catch {}

  activeParts = [];
  activeSynths = [];
  activeEffects = [];
  activeAnalyzer = null;

  try {
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
  } catch {}

  startVisualizerLoop();
}

function startVisualizerLoop() {
  const ctx = visualizerCanvas.getContext("2d");
  const { width, height } = visualizerCanvas;

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(11, 16, 15, 0.28)";
    ctx.fillRect(0, 0, width, height);

    const waveform = activeAnalyzer ? activeAnalyzer.getValue() : null;
    const values = waveform || new Float32Array(256).fill(0);

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffb56b";

    for (let i = 0; i < values.length; i += 1) {
      const x = (i / (values.length - 1)) * width;
      const y = (0.5 + values[i] * 0.45) * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    visualizationFrame = requestAnimationFrame(draw);
  };

  draw();
}

function renderAnalysis(colorProfile, detections, composition) {
  palette.innerHTML = "";
  objectsList.innerHTML = "";
  musicMeta.innerHTML = "";

  for (const color of colorProfile.dominantColors) {
    const swatch = document.createElement("div");
    swatch.className = "palette-swatch";
    swatch.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
    swatch.title = `rgb(${color.r}, ${color.g}, ${color.b})`;
    palette.appendChild(swatch);
  }

  if (detections.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No clear objects were detected";
    objectsList.appendChild(item);
  } else {
    for (const detection of detections) {
      const item = document.createElement("li");
      item.textContent = `${detection.class} (${Math.round(detection.score * 100)}%)`;
      objectsList.appendChild(item);
    }
  }

  const metrics = [
    `Tempo: ${composition.tempo} BPM`,
    `Saturation: ${(colorProfile.saturation * 100).toFixed(1)}%`,
    `Brightness: ${(colorProfile.brightness * 100).toFixed(1)}%`,
    `Mood: ${composition.mood}`,
    `Notes in motif: ${composition.motif.length}`,
    `Style: ${composition.style}`,
    `Fast mode: ${composition.fastMode ? "On" : "Off"}`
  ];

  for (const metric of metrics) {
    const item = document.createElement("li");
    item.textContent = metric;
    musicMeta.appendChild(item);
  }
}

function describeMood(hue, brightness, saturation) {
  if (brightness > 0.65 && saturation > 0.5) return "bright and energetic";
  if (brightness < 0.35) return "deep and atmospheric";
  if (hue > 180 && saturation > 0.45) return "cool and rhythmic";
  return "soft and flowing";
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;

  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      case bn:
        h = ((rn - gn) / d + 4) * 60;
        break;
      default:
        h = 0;
    }
  }

  return { h, l };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createRng(seed) {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function shiftNoteOctave(note, octaveShift) {
  if (octaveShift === 0) {
    return note;
  }

  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) {
    return note;
  }

  const [, pitch, octaveText] = match;
  const nextOctave = clamp(Number(octaveText) + octaveShift, 1, 7);
  return `${pitch}${nextOctave}`;
}

function normalizePlayableNote(note, fallbackOctave) {
  if (typeof note !== "string") {
    return `C${fallbackOctave}`;
  }

  const cleaned = note.trim().toUpperCase();
  const withOctave = cleaned.match(/^([A-G]#?)(\d)$/);
  if (withOctave) {
    return `${withOctave[1]}${withOctave[2]}`;
  }

  const noOctave = cleaned.match(/^([A-G]#?)$/);
  if (noOctave) {
    return `${noOctave[1]}${fallbackOctave}`;
  }

  return `C${fallbackOctave}`;
}

function safeStopDispose(node) {
  if (!node) {
    return;
  }

  try {
    if (typeof node.stop === "function") {
      node.stop();
    }
  } catch {
    // Ignore stop race conditions from overlapping runs.
  }

  safeDispose(node);
}

function safeDispose(node) {
  if (!node || typeof node.dispose !== "function") {
    return;
  }

  try {
    node.dispose();
  } catch {
    // Ignore already-disposed nodes during rapid restarts.
  }
}
