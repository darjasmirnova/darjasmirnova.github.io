const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");
const colorPicker = document.getElementById("colorPicker");
const sizeRange = document.getElementById("sizeRange");
const sizeValue = document.getElementById("sizeValue");
const clearBtn = document.getElementById("clearBtn");
const eraserBtn = document.getElementById("eraserBtn");
const saveBtn = document.getElementById("saveBtn");
const galleryGrid = document.getElementById("galleryGrid");
const galleryEmpty = document.getElementById("galleryEmpty");
const clearGalleryBtn = document.getElementById("clearGalleryBtn");

const STORAGE_KEY = "drawing_app_gallery_v1";

let drawing = false;
let currentColor = colorPicker.value;
let brushSize = Number(sizeRange.value);
let eraserMode = false;
let galleryItems = [];

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);

  canvas.width = Math.floor(rect.width);
  canvas.height = Math.floor(rect.height);

  ctx.putImageData(image, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function getPos(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function startDraw(event) {
  drawing = true;
  const { x, y } = getPos(event);
  ctx.beginPath();
  ctx.moveTo(x, y);
}

function draw(event) {
  if (!drawing) {
    return;
  }

  const { x, y } = getPos(event);
  ctx.lineWidth = brushSize;
  ctx.strokeStyle = eraserMode ? "#ffffff" : currentColor;
  ctx.lineTo(x, y);
  ctx.stroke();
}

function stopDraw() {
  drawing = false;
  ctx.beginPath();
}

function isCanvasBlank() {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) {
      return false;
    }
  }
  return true;
}

function saveGallery() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(galleryItems));
}

function loadGallery() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    galleryItems = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    galleryItems = Array.isArray(parsed) ? parsed : [];
  } catch {
    galleryItems = [];
  }
}

function drawImageToCanvas(dataUrl) {
  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);
  };
  image.src = dataUrl;
}

function createGalleryCard(item) {
  const card = document.createElement("article");
  card.className = "gallery-item";

  const img = document.createElement("img");
  img.src = item.dataUrl;
  img.alt = "Saved drawing";

  const meta = document.createElement("p");
  meta.className = "gallery-meta";
  meta.textContent = item.createdAt;

  const actions = document.createElement("div");
  actions.className = "gallery-actions";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    const shouldDelete = confirm("Delete this drawing from the gallery?");
    if (!shouldDelete) {
      return;
    }

    galleryItems = galleryItems.filter((entry) => entry.id !== item.id);
    saveGallery();
    renderGallery();
  });

  actions.append(deleteBtn);
  card.append(img, meta, actions);
  return card;
}

function renderGallery() {
  galleryGrid.innerHTML = "";
  galleryEmpty.style.display = galleryItems.length ? "none" : "block";
  clearGalleryBtn.disabled = galleryItems.length === 0;

  galleryItems.forEach((item) => {
    galleryGrid.append(createGalleryCard(item));
  });
}

function clearAllGallery() {
  if (!galleryItems.length) {
    return;
  }

  const shouldClear = confirm("Clear all saved drawings from the gallery?");
  if (!shouldClear) {
    return;
  }

  galleryItems = [];
  saveGallery();
  renderGallery();
}

function saveCurrentDrawing() {
  if (isCanvasBlank()) {
    alert("Draw something first, then save it to the gallery.");
    return;
  }

  const entry = {
    id: Date.now(),
    createdAt: new Date().toLocaleString(),
    dataUrl: canvas.toDataURL("image/png"),
  };

  galleryItems.unshift(entry);
  galleryItems = galleryItems.slice(0, 24);
  saveGallery();
  renderGallery();
}

colorPicker.addEventListener("input", (event) => {
  currentColor = event.target.value;
  if (eraserMode) {
    eraserMode = false;
    eraserBtn.classList.remove("active");
  }
});

sizeRange.addEventListener("input", (event) => {
  brushSize = Number(event.target.value);
  sizeValue.textContent = String(brushSize);
});

clearBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

eraserBtn.addEventListener("click", () => {
  eraserMode = !eraserMode;
  eraserBtn.classList.toggle("active", eraserMode);
});

saveBtn.addEventListener("click", saveCurrentDrawing);
clearGalleryBtn.addEventListener("click", clearAllGallery);

canvas.addEventListener("pointerdown", startDraw);
canvas.addEventListener("pointermove", draw);
canvas.addEventListener("pointerup", stopDraw);
canvas.addEventListener("pointerleave", stopDraw);

window.addEventListener("resize", resizeCanvas);

loadGallery();
renderGallery();
resizeCanvas();
