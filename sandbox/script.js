const canvas = document.getElementById("paint");
const ctx = canvas.getContext("2d");
const gravitySlider = document.getElementById("gravity");
const spawnRateSlider = document.getElementById("spawnRate");
const windSlider = document.getElementById("wind");
const formLogoBtn = document.getElementById("formLogoBtn");
const clearBtn = document.getElementById("clearBtn");
const modeButtons = document.querySelectorAll(".mode-btn");
const forceButtons = document.querySelectorAll(".force-btn");
const densityButtons = document.querySelectorAll(".density-btn");
const timeButtons = document.querySelectorAll(".time-btn");

// Material presets define how newly spawned particles behave.
// Each preset controls color range, launch speed/angle, drag, bounce and visual size.
// The update step uses these values to simulate distinct motion styles.
const MATERIALS = {
  sand: {
    hueMin: 20,
    hueMax: 40,
    speedMin: 0.4,
    speedMax: 3.2,
    angleMin: -Math.PI * 0.9,
    angleMax: Math.PI * 0.1,
    gravityScale: 1.2,
    dragX: 0.995,
    dragY: 0.998,
    lifeMin: 0.8,
    lifeMax: 1.6,
    sizeMin: 1.8,
    sizeMax: 4.8,
    bounce: -0.32,
    floorSlide: 0.75,
    lifeDecay: 0.5
  },
  water: {
    hueMin: 190,
    hueMax: 212,
    speedMin: 0.5,
    speedMax: 2.4,
    angleMin: -Math.PI * 1.05,
    angleMax: Math.PI * 0.05,
    gravityScale: 0.8,
    dragX: 0.988,
    dragY: 0.994,
    lifeMin: 0.9,
    lifeMax: 1.7,
    sizeMin: 2.2,
    sizeMax: 5,
    bounce: -0.08,
    floorSlide: 0.93,
    lifeDecay: 0.42
  },
  gas: {
    hueMin: 110,
    hueMax: 145,
    speedMin: 0.25,
    speedMax: 1.6,
    angleMin: -Math.PI,
    angleMax: Math.PI,
    gravityScale: -0.95,
    dragX: 0.992,
    dragY: 0.992,
    lifeMin: 0.7,
    lifeMax: 1.3,
    sizeMin: 2.8,
    sizeMax: 6,
    bounce: -0.16,
    floorSlide: 0.98,
    lifeDecay: 0.62
  }
};

const particles = [];
const textSamplerCanvas = document.createElement("canvas");
const textSamplerCtx = textSamplerCanvas.getContext("2d", { willReadFrequently: true });
const PARTICLE_LIFETIME_SECONDS = 10;

// Central mutable state for the simulation and UI controls.
// Most interaction handlers only update this object, while the animation loop
// reads from it once per frame to keep behavior deterministic.
const state = {
  drawing: false,
  x: 0,
  y: 0,
  gravity: Number(gravitySlider.value),
  spawnRate: Number(spawnRateSlider.value),
  wind: Number(windSlider.value),
  material: "sand",
  brushForce: "attract",
  logoLock: false,
  densityHighlight: true,
  timeFrozen: false,
  respawnX: canvas.clientWidth * 0.5,
  respawnY: canvas.clientHeight * 0.5
};

let audioCtx = null;
let lastCollisionSoundAt = 0;

// Lazily initialize AudioContext because browsers block audio until user gesture.
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

// Generate a short procedural "tick" when particles collide and blend color.
// Intensity modulates pitch and loudness, and a minimal cooldown prevents noise spam.
function playCollisionSound(intensity) {
  const now = performance.now();
  if (now - lastCollisionSoundAt < 26) {
    return;
  }

  const ctxAudio = getAudioContext();
  if (!ctxAudio) {
    return;
  }

  if (ctxAudio.state === "suspended") {
    ctxAudio.resume();
  }

  lastCollisionSoundAt = now;

  const t0 = ctxAudio.currentTime;
  const duration = randomBetween(0.035, 0.075);
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  const filter = ctxAudio.createBiquadFilter();

  const clampedIntensity = Math.max(0.4, Math.min(1.8, intensity));
  const baseFreq = randomBetween(280, 720) * clampedIntensity;
  const endFreq = baseFreq * randomBetween(0.72, 0.92);

  osc.type = randomBetween(0, 1) > 0.5 ? "triangle" : "square";
  osc.frequency.setValueAtTime(baseFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(90, endFreq), t0 + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(randomBetween(900, 2200), t0);
  filter.Q.value = 0.7;

  const peak = randomBetween(0.02, 0.055) * clampedIntensity;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctxAudio.destination);

  osc.start(t0);
  osc.stop(t0 + duration + 0.01);
}

// Keep canvas buffer in sync with CSS size and device pixel ratio for crisp rendering.
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const w = Math.floor(canvas.clientWidth * ratio);
  const h = Math.floor(canvas.clientHeight * ratio);

  if (canvas.width === w && canvas.height === h) {
    return;
  }

  canvas.width = w;
  canvas.height = h;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

// Small utility used throughout the simulation for randomized behavior.
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Build a new particle with initial velocity/color sampled from the chosen material.
function createParticle(x, y, kind) {
  const material = MATERIALS[kind] || MATERIALS.sand;
  const speed = randomBetween(material.speedMin, material.speedMax);
  const angle = randomBetween(material.angleMin, material.angleMax);

  return {
    x,
    y,
    vx: Math.cos(angle) * speed + randomBetween(-0.6, 0.6),
    vy: Math.sin(angle) * speed + randomBetween(-0.5, 0.2),
    life: PARTICLE_LIFETIME_SECONDS,
    size: randomBetween(material.sizeMin, material.sizeMax),
    hue: randomBetween(material.hueMin, material.hueMax),
    kind,
    targetX: null,
    targetY: null
  };
}

// Recycle an existing particle in-place when it "dies" or leaves bounds.
// Reuse avoids array churn and keeps memory pressure lower than removing/adding objects.
function resetParticle(particle, x, y) {
  const kind = state.material;
  const material = MATERIALS[kind] || MATERIALS.sand;
  const speed = randomBetween(material.speedMin, material.speedMax);
  const angle = randomBetween(material.angleMin, material.angleMax);

  particle.x = x;
  particle.y = y;
  particle.vx = Math.cos(angle) * speed + randomBetween(-0.6, 0.6);
  particle.vy = Math.sin(angle) * speed + randomBetween(-0.5, 0.2);
  particle.life = PARTICLE_LIFETIME_SECONDS;
  particle.size = randomBetween(material.sizeMin, material.sizeMax);
  particle.hue = randomBetween(material.hueMin, material.hueMax);
  particle.kind = kind;
  particle.targetX = null;
  particle.targetY = null;
}

// Spawn a burst of particles at pointer position while drawing.
function spawnParticles(x, y, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push(createParticle(x, y, state.material));
  }
}

// Rasterize a word to an off-screen canvas and sample opaque pixels.
// Returned points become attractor targets for logo formation mode.
function makeTextTargets(text) {
  const width = Math.max(100, Math.floor(canvas.clientWidth));
  const height = Math.max(100, Math.floor(canvas.clientHeight));
  const fontSize = Math.max(36, Math.floor(Math.min(width * 0.18, height * 0.42)));

  textSamplerCanvas.width = width;
  textSamplerCanvas.height = height;
  textSamplerCtx.clearRect(0, 0, width, height);
  textSamplerCtx.fillStyle = "#000";
  textSamplerCtx.textAlign = "center";
  textSamplerCtx.textBaseline = "middle";
  textSamplerCtx.font = `900 ${fontSize}px Trebuchet MS, Segoe UI, sans-serif`;
  textSamplerCtx.fillText(text, width / 2, height / 2);

  const imageData = textSamplerCtx.getImageData(0, 0, width, height).data;
  const step = 7;
  const targets = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4 + 3;
      if (imageData[idx] > 18) {
        targets.push({ x, y });
      }
    }
  }

  return targets;
}

// In-place Fisher-Yates shuffle for random target assignment.
function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }
}

// Convert current particle cloud into a text logo.
// If there are not enough particles to fill the sampled glyph points,
// additional particles are created first.
function assignLogoTargets() {
  const targets = makeTextTargets("NPMM25");
  if (!targets.length) {
    return;
  }

  while (particles.length < targets.length) {
    particles.push(createParticle(randomBetween(0, canvas.clientWidth), randomBetween(0, canvas.clientHeight), state.material));
  }

  shuffleArray(targets);

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const target = targets[i % targets.length];
    p.targetX = target.x;
    p.targetY = target.y;
    p.life = Math.max(p.life, 2.5);
  }

  state.logoLock = true;
}

// Apply attraction toward per-particle text targets while logo mode is active.
// Damping is intentionally high to make particles settle and hold shape.
function applyLogoLockForce(dt) {
  if (!state.logoLock) {
    return;
  }

  for (const p of particles) {
    if (p.targetX === null || p.targetY === null) {
      continue;
    }

    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dist > 0.001 ? dx / dist : 0;
    const ny = dist > 0.001 ? dy / dist : 0;
    const pull = Math.min(18, dist * 0.14);

    p.vx += nx * pull * dt * 60;
    p.vy += ny * pull * dt * 60;
    p.vx *= 0.965;
    p.vy *= 0.965;
    p.life = Math.max(p.life, 1.1);
  }
}

// Draw one particle as a soft circle with alpha based on remaining lifetime.
function drawParticle(p) {
  const alpha = Math.max(0, Math.min(1, p.life / PARTICLE_LIFETIME_SECONDS));
  ctx.fillStyle = `hsla(${p.hue}, 90%, 45%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
}

// Apply brush influence around pointer position.
// "attract" pulls inward, "scatter" pushes outward in the same radial field.
function applyBrushForce(dt) {
  const radius = 140;
  const radiusSq = radius * radius;
  const direction = state.brushForce === "attract" ? 1 : -1;

  for (const p of particles) {
    const dx = state.x - p.x;
    const dy = state.y - p.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < 1 || distSq > radiusSq) {
      continue;
    }

    const dist = Math.sqrt(distSq);
    const pull = (1 - dist / radius) * 9.5;
    const nx = dx / dist;
    const ny = dy / dist;

    p.vx += nx * pull * direction * dt * 60;
    p.vy += ny * pull * direction * dt * 60;
  }
}

// Average two hues using shortest-path interpolation on a circular color wheel.
function mixHue(h1, h2) {
  const delta = ((h2 - h1 + 540) % 360) - 180;
  return (h1 + delta * 0.5 + 360) % 360;
}

// Spatial hash collision pass:
// 1) Place particles into grid cells.
// 2) Check only neighboring cells for overlap candidates.
// 3) On contact, blend colors and apply small separating impulse.
function blendCollidingParticleColors() {
  const cellSize = 14;
  const grid = new Map();

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const key = `${cx}:${cy}`;

    if (!grid.has(key)) {
      grid.set(key, []);
    }

    grid.get(key).push(i);
  }

  for (let i = 0; i < particles.length; i += 1) {
    const a = particles[i];
    const cx = Math.floor(a.x / cellSize);
    const cy = Math.floor(a.y / cellSize);

    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const key = `${cx + ox}:${cy + oy}`;
        const bucket = grid.get(key);

        if (!bucket) {
          continue;
        }

        for (const j of bucket) {
          if (j <= i) {
            continue;
          }

          const b = particles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDist = (a.size + b.size) * 0.9;
          const distSq = dx * dx + dy * dy;

          if (distSq > minDist * minDist) {
            continue;
          }

          const hueGap = Math.abs((((a.hue - b.hue) % 360) + 540) % 360 - 180);

          if (hueGap < 4) {
            continue;
          }

          const mixedHue = mixHue(a.hue, b.hue);
          a.hue = mixedHue;
          b.hue = mixedHue;

          const relVx = b.vx - a.vx;
          const relVy = b.vy - a.vy;
          const impact = Math.sqrt(relVx * relVx + relVy * relVy);
          playCollisionSound(impact / 3.5);

          // Slight separation keeps overlapped particles from blending forever in one point.
          const dist = Math.sqrt(Math.max(0.0001, distSq));
          const nx = dx / dist;
          const ny = dy / dist;
          const push = (minDist - dist) * 0.08;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
        }
      }
    }
  }
}

// Highlight areas where local particle density is near the global maximum.
// The visualization is a soft radial glow painted over the normal particles.
function drawDensityHotspots() {
  if (particles.length < 12) {
    return;
  }

  const cellSize = 28;
  const densityMap = new Map();
  let maxCount = 0;

  for (const p of particles) {
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const key = `${cx}:${cy}`;
    const current = (densityMap.get(key) || 0) + 1;
    densityMap.set(key, current);
    if (current > maxCount) {
      maxCount = current;
    }
  }

  if (maxCount < 6) {
    return;
  }

  const threshold = Math.max(6, Math.floor(maxCount * 0.82));

  for (const [key, count] of densityMap.entries()) {
    if (count < threshold) {
      continue;
    }

    const [cx, cy] = key.split(":").map(Number);
    const x = cx * cellSize + cellSize * 0.5;
    const y = cy * cellSize + cellSize * 0.5;
    const intensity = (count - threshold + 1) / (maxCount - threshold + 1);
    const radius = 12 + intensity * 28;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 70, 25, ${0.24 + intensity * 0.22})`);
    gradient.addColorStop(1, "rgba(255, 70, 25, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Core physics integration step for all particles.
// Handles gravity/wind, material-specific drift, floor/ceiling interactions,
// lifetime countdown and particle respawn at last click location.
function updateParticles(dt) {
  const top = 2;
  const floor = canvas.clientHeight - 2;

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    const material = MATERIALS[p.kind] || MATERIALS.sand;
    p.vy += state.gravity * material.gravityScale * dt * 40;
    p.vx += state.wind * dt * 22;
    p.vx *= material.dragX;
    p.vy *= material.dragY;

    if (p.kind === "water") {
      p.vx += randomBetween(-0.03, 0.03);
    } else if (p.kind === "gas") {
      p.vx += randomBetween(-0.02, 0.02);
    }

    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.life -= dt;

    if (p.y > floor) {
      p.y = floor;
      p.vy *= material.bounce;
      p.vx *= material.floorSlide;

      if (p.kind === "water") {
        p.vx += randomBetween(-0.15, 0.15);
      }
    }

    if (p.kind === "gas" && p.y < top) {
      p.y = top;
      p.vy *= material.bounce;
    }

    if (p.life <= 0 || p.x < -30 || p.x > canvas.clientWidth + 30 || p.y > canvas.clientHeight + 35) {
      resetParticle(p, state.respawnX, state.respawnY);
    }
  }
}

let lastTime = performance.now();

// Main animation loop.
// Uses frame delta time for smooth, framerate-independent movement and
// supports freeze mode by skipping state mutation while keeping the frame visible.
function loop(time) {
  const dt = state.timeFrozen ? 0 : Math.min((time - lastTime) / 1000, 0.03);
  lastTime = time;

  if (!state.timeFrozen && state.drawing) {
    spawnParticles(state.x, state.y, state.spawnRate);
    applyBrushForce(dt);
  }

  if (!state.timeFrozen) {
    applyLogoLockForce(dt);
    updateParticles(dt);
    blendCollidingParticleColors();
  }
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  for (const p of particles) {
    drawParticle(p);
  }

  if (state.densityHighlight) {
    drawDensityHotspots();
  }

  requestAnimationFrame(loop);
}

// Convert global pointer coordinates into local canvas coordinates.
function pointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

// Pointer controls drawing and also define the global respawn point.
canvas.addEventListener("pointerdown", (evt) => {
  state.drawing = true;
  const pos = pointerPos(evt);
  state.x = pos.x;
  state.y = pos.y;
  state.respawnX = pos.x;
  state.respawnY = pos.y;
  spawnParticles(state.x, state.y, state.spawnRate * 2);
  canvas.setPointerCapture(evt.pointerId);
});

canvas.addEventListener("pointermove", (evt) => {
  const pos = pointerPos(evt);
  state.x = pos.x;
  state.y = pos.y;
});

canvas.addEventListener("pointerup", () => {
  state.drawing = false;
});

canvas.addEventListener("pointerleave", () => {
  state.drawing = false;
});

gravitySlider.addEventListener("input", () => {
  state.gravity = Number(gravitySlider.value);
});

spawnRateSlider.addEventListener("input", () => {
  state.spawnRate = Number(spawnRateSlider.value);
});

windSlider.addEventListener("input", () => {
  state.wind = Number(windSlider.value);
});

clearBtn.addEventListener("click", () => {
  particles.length = 0;
  state.logoLock = false;
});

formLogoBtn.addEventListener("click", () => {
  assignLogoTargets();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.material = button.dataset.material;
    modeButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

forceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.brushForce = button.dataset.force;
    forceButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

densityButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.densityHighlight = button.dataset.density === "on";
    densityButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

timeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.timeFrozen = button.dataset.time === "freeze";
    timeButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

// Start simulation and keep canvas resolution synced to viewport changes.
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
requestAnimationFrame(loop);
