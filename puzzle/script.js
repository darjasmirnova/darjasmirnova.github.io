const DEFAULT_GRID_SIZE = 5;
const ALLOWED_GRID_SIZES = [3, 5, 10];
const DESKTOP_BOARD_SIZE = 1240;
const MOBILE_BOARD_SIZE = 840;
const MIN_PIECE_SIZE = 96;
const SHAPE_MODES = ["square", "triangle", "polygon"];
const RECORDS_STORAGE_KEY = "pixel-puzzle-records-json";
const MAX_RECORDS = 20;

const imageInput = document.getElementById("imageInput");
const cameraInput = document.getElementById("cameraInput");
const musicInput = document.getElementById("musicInput");
const difficultySelect = document.getElementById("difficultySelect");
const uploadBtn = document.getElementById("uploadBtn");
const cameraBtn = document.getElementById("cameraBtn");
const sliceBtn = document.getElementById("sliceBtn");
const shapeBtn = document.getElementById("shapeBtn");
const previewBtn = document.getElementById("previewBtn");
const snapBtn = document.getElementById("snapBtn");
const musicBtn = document.getElementById("musicBtn");
const soundFxBtn = document.getElementById("soundFxBtn");
const sourceImage = document.getElementById("sourceImage");
const sourcePlaceholder = document.getElementById("sourcePlaceholder");
const boardStage = document.getElementById("boardStage");
const ghostImage = document.getElementById("ghostImage");
const assemblyGrid = document.getElementById("assemblyGrid");
const piecesStorage = document.getElementById("piecesStorage");
const recordsTableBody = document.getElementById("recordsTableBody");
const winMessage = document.getElementById("winMessage");
const explosionCanvas = document.getElementById("explosionCanvas");

let loadedImage = null;
let currentGridSize = DEFAULT_GRID_SIZE;
let currentPieceSize = calculatePieceSize(currentGridSize);
let currentShapeMode = SHAPE_MODES[0];
let ghostVisible = false;
let magnetEnabled = false;
let preparedGhostUrl = "";
let audioContext = null;
let selectedMusicUrl = "";
let musicAudio = null;
let effectsEnabled = true;
let puzzleSolved = false;
let solveTimerStart = 0;
let solveResultSaved = false;

init();

/**
 * Initializes the game UI, board state, and all event listeners.
 * This function is the single entry point for the page runtime.
 */
function init() {
  // Apply initial UI and board state before any user interaction.
  difficultySelect.value = String(currentGridSize);
  applyGridMetrics();
  createAssemblyGrid();
  initStorageDropZone();
  updateShapeButtonLabel();
  renderLeaderboard();

  uploadBtn.addEventListener("click", () => imageInput.click());
  cameraBtn.addEventListener("click", () => cameraInput.click());
  musicBtn.addEventListener("click", () => musicInput.click());

  imageInput.addEventListener("change", handleImageUpload);
  cameraInput.addEventListener("change", handleImageUpload);
  musicInput.addEventListener("change", handleMusicUpload);

  difficultySelect.addEventListener("change", handleDifficultyChange);
  shapeBtn.addEventListener("click", toggleShapeMode);
  previewBtn.addEventListener("click", toggleGhostPreview);
  snapBtn.addEventListener("click", toggleMagnetMode);
  soundFxBtn.addEventListener("click", toggleEffects);

  sliceBtn.addEventListener("click", () => {
    if (!loadedImage) {
      alert("Please upload a photo first");
      return;
    }

    sliceImageToPuzzle(loadedImage);
  });
}

/**
 * Handles difficulty selection changes.
 * Recalculates piece size, rebuilds the target grid, clears staged pieces,
 * hides preview, and resets current solve session state.
 *
 * @param {Event} event - Change event from difficulty dropdown.
 */
function handleDifficultyChange(event) {
  const nextGridSize = Number(event.target.value);
  if (!ALLOWED_GRID_SIZES.includes(nextGridSize)) {
    return;
  }

  currentGridSize = nextGridSize;
  currentPieceSize = calculatePieceSize(currentGridSize);
  applyGridMetrics();
  createAssemblyGrid();
  piecesStorage.innerHTML = "";
  hideGhostPreview();
  resetSolveState();
}

/**
 * Synchronizes CSS-driven board metrics with current logical state.
 * Updates custom properties used by layout/rendering and aria label text.
 */
function applyGridMetrics() {
  // CSS variables drive board and piece sizes across layout and rendering.
  document.documentElement.style.setProperty("--grid-size", String(currentGridSize));
  document.documentElement.style.setProperty("--tile-size", `${currentPieceSize}px`);
  assemblyGrid.setAttribute("aria-label", `Assembly board ${currentGridSize} by ${currentGridSize}`);
}

/**
 * Calculates piece pixel size for current device class.
 * Uses larger board on desktop and smaller board on mobile, then enforces
 * a minimum size so pieces remain draggable/readable.
 *
 * @param {number} gridSize - Number of rows/columns in puzzle.
 * @returns {number} Piece size in pixels.
 */
function calculatePieceSize(gridSize) {
  const boardSize = window.matchMedia("(max-width: 980px)").matches
    ? MOBILE_BOARD_SIZE
    : DESKTOP_BOARD_SIZE;

  return Math.max(MIN_PIECE_SIZE, Math.floor(boardSize / gridSize));
}

/**
 * Creates and wires all drop cells for the assembly board.
 * Each cell accepts drag/drop and swaps existing piece back to storage
 * when a new piece is dropped into an occupied slot.
 */
function createAssemblyGrid() {
  // Rebuild the target grid each time difficulty or puzzle setup changes.
  assemblyGrid.innerHTML = "";

  for (let i = 0; i < currentGridSize * currentGridSize; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = String(i);

    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      cell.classList.add("drag-over");
    });

    cell.addEventListener("dragleave", () => {
      cell.classList.remove("drag-over");
    });

    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      cell.classList.remove("drag-over");

      const pieceId = event.dataTransfer.getData("text/plain");
      const pieceElement = document.getElementById(pieceId);
      if (!pieceElement) {
        return;
      }

      const existing = cell.querySelector(".piece");
      if (existing) {
        piecesStorage.appendChild(existing);
      }

      cell.appendChild(pieceElement);
      const snapped = attemptSnapToCorrectCell(pieceElement);
      if (!snapped) {
        playPlaceSound();
      }
      checkWinCondition();
    });

    assemblyGrid.appendChild(cell);
  }
}

/**
 * Initializes drag/drop behavior for the storage container.
 * Allows pieces to be dropped back from board to storage.
 */
function initStorageDropZone() {
  // Storage works as a drop target to return pieces back from the board.
  piecesStorage.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  piecesStorage.addEventListener("drop", (event) => {
    event.preventDefault();

    const pieceId = event.dataTransfer.getData("text/plain");
    const pieceElement = document.getElementById(pieceId);
    if (!pieceElement) {
      return;
    }

    piecesStorage.appendChild(pieceElement);
    attemptSnapToCorrectCell(pieceElement);
    checkWinCondition();
  });
}

/**
 * Validates selected file presence and forwards image loading.
 *
 * @param {Event} event - File input change event.
 */
function handleImageUpload(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  event.target.value = "";

  loadImageFromFile(file);
}

/**
 * Loads an image file into preview and prepares it for slicing.
 * Resets preview and solve state so a new image starts a clean round.
 *
 * @param {File} file - Selected image file.
 */
function loadImageFromFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("Please select an image file");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    sourceImage.src = reader.result;
    sourceImage.style.display = "block";
    sourcePlaceholder.style.display = "none";
    hideGhostPreview();
    preparedGhostUrl = "";
    resetSolveState();

    const img = new Image();
    img.onload = () => {
      loadedImage = img;
    };
    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}

/**
 * Loads and starts background music from user-selected audio file.
 * Reuses one Audio element and updates button state based on play result.
 *
 * @param {Event} event - File input change event for audio selection.
 */
function handleMusicUpload(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  event.target.value = "";

  if (!file.type.startsWith("audio/")) {
    alert("Please select an audio file");
    return;
  }

  if (selectedMusicUrl) {
    URL.revokeObjectURL(selectedMusicUrl);
  }

  selectedMusicUrl = URL.createObjectURL(file);

  if (!musicAudio) {
    musicAudio = new Audio();
    musicAudio.loop = true;
  }

  musicAudio.src = selectedMusicUrl;
  musicAudio.volume = 0.35;
  musicAudio
    .play()
    .then(() => {
      musicBtn.textContent = "Music: Playing";
      musicBtn.classList.add("is-active");
    })
    .catch(() => {
      musicBtn.textContent = "Music: Selected";
      musicBtn.classList.add("is-active");
    });
}

/**
 * Cycles through piece shape modes and regenerates puzzle if image exists.
 */
function toggleShapeMode() {
  const currentIndex = SHAPE_MODES.indexOf(currentShapeMode);
  const nextIndex = (currentIndex + 1) % SHAPE_MODES.length;
  currentShapeMode = SHAPE_MODES[nextIndex];
  updateShapeButtonLabel();

  if (loadedImage) {
    sliceImageToPuzzle(loadedImage);
  }
}

/**
 * Updates shape button label to match active mode.
 */
function updateShapeButtonLabel() {
  if (currentShapeMode === "square") {
    shapeBtn.textContent = "Shape: Squares";
    return;
  }

  if (currentShapeMode === "triangle") {
    shapeBtn.textContent = "Shape: Triangles";
    return;
  }

  shapeBtn.textContent = "Shape: Polygons";
}

/**
 * Converts source image into puzzle pieces for current grid/shape settings.
 * Builds a normalized square source canvas, slices pieces, and shuffles them.
 *
 * @param {HTMLImageElement} image - Loaded source image.
 */
function sliceImageToPuzzle(image) {
  // Render one normalized square image first, then cut it into pieces.
  currentPieceSize = calculatePieceSize(currentGridSize);
  applyGridMetrics();

  const targetSize = currentGridSize * currentPieceSize;
  const workCanvas = document.createElement("canvas");
  workCanvas.width = targetSize;
  workCanvas.height = targetSize;
  const workCtx = workCanvas.getContext("2d");

  drawImageCover(workCtx, image, targetSize, targetSize);
  preparedGhostUrl = workCanvas.toDataURL("image/png");
  ghostImage.src = preparedGhostUrl;

  createAssemblyGrid();
  piecesStorage.innerHTML = "";
  resetSolveState();

  for (let row = 0; row < currentGridSize; row += 1) {
    for (let col = 0; col < currentGridSize; col += 1) {
      const pieceCanvas = document.createElement("canvas");
      pieceCanvas.width = currentPieceSize;
      pieceCanvas.height = currentPieceSize;
      const pieceCtx = pieceCanvas.getContext("2d");

      drawShapedPiece(
        pieceCtx,
        workCanvas,
        row,
        col,
        currentPieceSize,
        currentShapeMode
      );

      const pieceElement = document.createElement("img");
      pieceElement.className =
        currentShapeMode === "square" ? "piece" : "piece shaped";
      pieceElement.id = `piece-${currentGridSize}-${row}-${col}`;
      pieceElement.width = currentPieceSize;
      pieceElement.height = currentPieceSize;
      pieceElement.draggable = true;
      pieceElement.dataset.correctIndex = String(row * currentGridSize + col);
      pieceElement.src = pieceCanvas.toDataURL("image/png");
      pieceElement.alt = `Puzzle piece ${row + 1}-${col + 1}`;

      pieceElement.addEventListener("dragstart", (event) => {
        // Timer starts on first meaningful interaction with puzzle pieces.
        startSolveTimerIfNeeded();
        event.dataTransfer.setData("text/plain", pieceElement.id);
      });

      pieceElement.addEventListener("pointerdown", startSolveTimerIfNeeded, {
        passive: true
      });

      piecesStorage.appendChild(pieceElement);
    }
  }

  shuffleStoragePieces();
}

/**
 * Toggles ghost preview visibility on assembly board.
 * Shows/hides target image overlay for easier solving.
 */
function toggleGhostPreview() {
  if (!preparedGhostUrl) {
    alert("Please cut the image into puzzle pieces first");
    return;
  }

  ghostVisible = !ghostVisible;
  boardStage.classList.toggle("ghost-visible", ghostVisible);
  previewBtn.classList.toggle("is-active", ghostVisible);
  previewBtn.textContent = ghostVisible ? "Hide" : "Preview";
}

/**
 * Forces ghost preview off and resets preview button state.
 */
function hideGhostPreview() {
  ghostVisible = false;
  boardStage.classList.remove("ghost-visible");
  previewBtn.classList.remove("is-active");
  previewBtn.textContent = "Preview";
}

/**
 * Toggles magnet mode used for near-target auto-snapping.
 */
function toggleMagnetMode() {
  magnetEnabled = !magnetEnabled;
  snapBtn.classList.toggle("is-active", magnetEnabled);
  snapBtn.textContent = magnetEnabled ? "Magnet: On" : "Magnet: Off";
}

/**
 * Toggles sound effects (piece placement and win fanfare).
 */
function toggleEffects() {
  effectsEnabled = !effectsEnabled;
  soundFxBtn.classList.toggle("is-active", effectsEnabled);
  soundFxBtn.textContent = effectsEnabled ? "SFX: On" : "SFX: Off";
}

/**
 * Attempts to snap a piece into its correct cell when magnet mode is enabled.
 * Uses center-point distance to decide whether to auto-place.
 *
 * @param {HTMLElement} pieceElement - Dragged puzzle piece element.
 * @returns {boolean} True if snap occurred, otherwise false.
 */
function attemptSnapToCorrectCell(pieceElement) {
  // Magnet mode auto-snaps a piece when it is dropped close to its target.
  if (!magnetEnabled) {
    return false;
  }

  const correctIndex = Number(pieceElement.dataset.correctIndex);
  if (Number.isNaN(correctIndex)) {
    return false;
  }

  const targetCell = assemblyGrid.querySelector(`.cell[data-index="${correctIndex}"]`);
  if (!targetCell) {
    return false;
  }

  const pieceRect = pieceElement.getBoundingClientRect();
  const targetRect = targetCell.getBoundingClientRect();
  const pieceCenterX = pieceRect.left + pieceRect.width / 2;
  const pieceCenterY = pieceRect.top + pieceRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const distance = Math.hypot(pieceCenterX - targetCenterX, pieceCenterY - targetCenterY);
  const threshold = Math.max(24, currentPieceSize * 1.1);

  if (distance > threshold) {
    return false;
  }

  const existingPiece = targetCell.querySelector(".piece");
  if (existingPiece && existingPiece !== pieceElement) {
    piecesStorage.appendChild(existingPiece);
  }

  targetCell.appendChild(pieceElement);
  targetCell.classList.add("snap-hit");
  setTimeout(() => targetCell.classList.remove("snap-hit"), 180);
  playPlaceSound();
  return true;
}

/**
 * Plays short placement sound for piece drop/snap actions.
 * Uses Web Audio API oscillator envelope for lightweight SFX.
 */
function playPlaceSound() {
  if (!effectsEnabled) {
    return;
  }

  try {
    // Reuse one audio context to avoid creating extra audio resources.
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      audioContext = new AudioContextClass();
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(1000, now);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.11);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } catch (error) {
    console.warn("Failed to play place sound", error);
  }
}

/**
 * Plays short ascending melody when puzzle is solved.
 */
function playWinSound() {
  if (!effectsEnabled) {
    return;
  }

  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      audioContext = new AudioContextClass();
    }

    const now = audioContext.currentTime;
    // Short ascending melody to clearly distinguish win feedback.
    const notes = [392, 523.25, 659.25, 783.99];

    notes.forEach((frequency, index) => {
      const startAt = now + index * 0.08;
      const endAt = startAt + 0.18;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt);
    });
  } catch (error) {
    console.warn("Failed to play win sound", error);
  }
}

/**
 * Draws image in "cover" mode onto target canvas without distortion.
 * Crops overflow while preserving aspect ratio.
 *
 * @param {CanvasRenderingContext2D} ctx - Target canvas context.
 * @param {HTMLImageElement|HTMLCanvasElement} img - Source image/canvas.
 * @param {number} targetWidth - Target canvas width.
 * @param {number} targetHeight - Target canvas height.
 */
function drawImageCover(ctx, img, targetWidth, targetHeight) {
  // "Cover" logic fills the square without distortion, cropping overflow.
  const imageRatio = img.width / img.height;
  const targetRatio = targetWidth / targetHeight;

  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

  if (imageRatio > targetRatio) {
    drawHeight = targetHeight;
    drawWidth = drawHeight * imageRatio;
    offsetX = (targetWidth - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = targetWidth;
    drawHeight = drawWidth / imageRatio;
    offsetX = 0;
    offsetY = (targetHeight - drawHeight) / 2;
  }

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

/**
 * Randomizes current storage piece order using Fisher-Yates shuffle.
 */
function shuffleStoragePieces() {
  const pieces = Array.from(piecesStorage.children);

  for (let i = pieces.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  pieces.forEach((piece) => piecesStorage.appendChild(piece));
}

/**
 * Draws one puzzle piece image using selected shape mode.
 * Square mode copies full tile; other modes use clip path masking.
 *
 * @param {CanvasRenderingContext2D} ctx - Piece canvas context.
 * @param {HTMLCanvasElement} imageCanvas - Normalized full image canvas.
 * @param {number} row - Piece row index.
 * @param {number} col - Piece column index.
 * @param {number} size - Piece size in pixels.
 * @param {"square"|"triangle"|"polygon"} shapeMode - Active shape mode.
 */
function drawShapedPiece(ctx, imageCanvas, row, col, size, shapeMode) {
  ctx.clearRect(0, 0, size, size);

  if (shapeMode === "square") {
    // Square mode keeps full tile area.
    ctx.drawImage(
      imageCanvas,
      col * size,
      row * size,
      size,
      size,
      0,
      0,
      size,
      size
    );
    return;
  }

  // Non-square modes draw using clipping path.
  ctx.save();
  buildPiecePath(ctx, shapeMode, row, col, size);
  ctx.clip();
  ctx.drawImage(
    imageCanvas,
    col * size,
    row * size,
    size,
    size,
    0,
    0,
    size,
    size
  );
  ctx.restore();
}

/**
 * Builds clipping path for non-square piece shapes.
 * Triangle alternates diagonal orientation; polygon uses deterministic seed.
 *
 * @param {CanvasRenderingContext2D} ctx - Piece canvas context.
 * @param {"square"|"triangle"|"polygon"} shapeMode - Active shape mode.
 * @param {number} row - Piece row index.
 * @param {number} col - Piece column index.
 * @param {number} size - Piece size in pixels.
 */
function buildPiecePath(ctx, shapeMode, row, col, size) {
  // Triangle mode alternates diagonals for visual variety.
  if (shapeMode === "triangle") {
    const mainDiagonal = (row + col) % 2 === 0;
    ctx.beginPath();
    if (mainDiagonal) {
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.lineTo(0, size);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(size, 0);
      ctx.lineTo(size, size);
    }
    ctx.closePath();
    return;
  }

  const seedBase = (row + 1) * 9283 + (col + 1) * 6899;
  // Polygon shape is deterministic per cell, so piece silhouette is stable.
  const sides = 5 + (seedBase % 3);
  const center = size / 2;
  const baseRadius = size * 0.46;

  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = (Math.PI * 2 * i) / sides;
    const jitter = seededValue(seedBase + i * 97) * (size * 0.16);
    const radius = baseRadius - jitter;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

/**
 * Deterministic pseudo-random helper returning value in [0, 1).
 *
 * @param {number} seed - Numeric seed.
 * @returns {number} Pseudo-random normalized value.
 */
function seededValue(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Checks whether all board cells contain their correct piece.
 * Triggers win flow only once per solved state transition.
 */
function checkWinCondition() {
  // Puzzle is solved only when each cell contains its matching piece.
  const cells = Array.from(assemblyGrid.querySelectorAll(".cell"));
  if (cells.length === 0) {
    return;
  }

  const solved = cells.every((cell) => {
    const piece = cell.querySelector(".piece");
    if (!piece) {
      return false;
    }

    return piece.dataset.correctIndex === cell.dataset.index;
  });

  if (solved && !puzzleSolved) {
    puzzleSolved = true;
    const elapsedMs = saveSolveResultIfNeeded();
    playWinSound();
    showWinMessage(elapsedMs);
    startWinExplosion();
    return;
  }

  if (!solved) {
    puzzleSolved = false;
  }
}

/**
 * Starts solve timer on first piece interaction.
 */
function startSolveTimerIfNeeded() {
  if (solveTimerStart > 0) {
    return;
  }

  const hasPieces = piecesStorage.children.length > 0 || assemblyGrid.querySelector(".piece");
  if (!hasPieces) {
    return;
  }

  solveTimerStart = Date.now();
}

/**
 * Resets current round state (solved flag, timer, save flag, win banner).
 */
function resetSolveState() {
  // Reset transient round state when new puzzle is generated.
  puzzleSolved = false;
  solveTimerStart = 0;
  solveResultSaved = false;
  hideWinMessage();
}

/**
 * Saves solve result once per round and refreshes leaderboard rendering.
 *
 * @returns {number|null} Elapsed milliseconds for current solve, or null.
 */
function saveSolveResultIfNeeded() {
  if (solveResultSaved || solveTimerStart === 0) {
    return null;
  }

  const elapsedMs = Date.now() - solveTimerStart;
  const records = loadRecords();
  const record = {
    elapsedMs,
    gridSize: currentGridSize,
    shapeMode: currentShapeMode,
    createdAt: new Date().toISOString()
  };

  records.push(record);
  records.sort((a, b) => a.elapsedMs - b.elapsedMs);

  const trimmed = records.slice(0, MAX_RECORDS);
  // Persist only top N fastest results.
  saveRecords(trimmed);
  renderLeaderboard(trimmed, record.createdAt);
  solveResultSaved = true;
  return elapsedMs;
}

/**
 * Loads records from localStorage with defensive parsing/validation.
 *
 * @returns {Array<{elapsedMs:number,gridSize:number,shapeMode:string,createdAt:string}>}
 * Filtered records array.
 */
function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => Number.isFinite(item.elapsedMs));
  } catch (error) {
    console.warn("Failed to read records", error);
    return [];
  }
}

/**
 * Persists records to localStorage.
 *
 * @param {Array<object>} records - Records to save.
 */
function saveRecords(records) {
  const jsonData = JSON.stringify(records, null, 2);
  localStorage.setItem(RECORDS_STORAGE_KEY, jsonData);
}

/**
 * Renders records table and annotates new/best statuses.
 *
 * @param {Array<object>|null} records - Optional records source.
 * @param {string|null} latestRecordId - createdAt id for latest saved result.
 */
function renderLeaderboard(records = null, latestRecordId = null) {
  if (!recordsTableBody) {
    return;
  }

  const data = records || loadRecords();
  recordsTableBody.innerHTML = "";

  if (data.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4">No records yet</td>';
    recordsTableBody.appendChild(row);
    return;
  }

  data.slice(0, 8).forEach((record, index) => {
    const row = document.createElement("tr");
    const isNew = latestRecordId !== null && record.createdAt === latestRecordId;
    const isBest = index === 0;
    let status = "";

    if (isNew && isBest) {
      status = "new best";
    } else if (isNew) {
      status = "new";
    } else if (isBest) {
      status = "best";
    }

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${formatDuration(record.elapsedMs)}</td>
      <td>${record.gridSize}x${record.gridSize}, ${formatShapeName(record.shapeMode)}</td>
      <td>${status || "-"}</td>
    `;

    const statusCell = row.lastElementChild;
    if (statusCell) {
      if (isNew) {
        statusCell.classList.add("is-status-new");
      }

      if (isBest) {
        statusCell.classList.add("is-status-best");
      }
    }

    recordsTableBody.appendChild(row);
  });
}

/**
 * Displays solved notification near the puzzle board.
 *
 * @param {number|null} elapsedMs - Solve duration in milliseconds.
 */
function showWinMessage(elapsedMs) {
  if (!winMessage) {
    return;
  }

  const solvedTime = Number.isFinite(elapsedMs)
    ? formatDuration(elapsedMs)
    : "--:--.--";
  winMessage.textContent = `Puzzle solved! Your time: ${solvedTime}`;
  winMessage.classList.add("is-visible");
}

/**
 * Hides solved notification banner.
 */
function hideWinMessage() {
  if (!winMessage) {
    return;
  }

  winMessage.textContent = "";
  winMessage.classList.remove("is-visible");
}

/**
 * Formats milliseconds into mm:ss.cc for UI display.
 *
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

/**
 * Converts internal shape mode key into display label text.
 *
 * @param {string} shapeMode - Internal mode key.
 * @returns {string} Human-readable shape label.
 */
function formatShapeName(shapeMode) {
  if (shapeMode === "square") {
    return "squares";
  }

  if (shapeMode === "polygon") {
    return "polygons";
  }

  return "triangles";
}

/**
 * Starts win particle animation on full-screen canvas.
 * Creates multiple burst origins and animates particles until fade-out.
 */
function startWinExplosion() {
  // Lightweight confetti-like particle burst on win.
  const ctx = explosionCanvas.getContext("2d");
  if (!ctx) {
    return;
  }

  explosionCanvas.width = window.innerWidth;
  explosionCanvas.height = window.innerHeight;

  const particles = [];
  const bursts = 6;
  for (let i = 0; i < bursts; i += 1) {
    const originX = (window.innerWidth / (bursts + 1)) * (i + 1);
    const originY = window.innerHeight * (0.25 + (i % 2) * 0.12);

    for (let p = 0; p < 45; p += 1) {
      const angle = (Math.PI * 2 * p) / 45;
      const speed = 2 + Math.random() * 5;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        life: 85 + Math.random() * 30,
        size: 2 + Math.random() * 3,
        color: `hsl(${Math.floor(Math.random() * 360)} 90% 60%)`
      });
    }
  }

  let frame = 0;

  const animate = () => {
    frame += 1;
    ctx.clearRect(0, 0, explosionCanvas.width, explosionCanvas.height);

    particles.forEach((particle) => {
      if (particle.life <= 0) {
        return;
      }

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.06;
      particle.vx *= 0.992;
      particle.life -= 1;

      ctx.globalAlpha = Math.max(0, particle.life / 110);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    const alive = particles.some((particle) => particle.life > 0);
    if (alive && frame < 160) {
      requestAnimationFrame(animate);
      return;
    }

    ctx.clearRect(0, 0, explosionCanvas.width, explosionCanvas.height);
  };

  requestAnimationFrame(animate);
}
