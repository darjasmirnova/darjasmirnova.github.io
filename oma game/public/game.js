const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const nameLabel = document.getElementById("nameLabel");
const levelLabel = document.getElementById("levelLabel");
const scoreLabel = document.getElementById("scoreLabel");
const livesLabel = document.getElementById("livesLabel");
const targetLabel = document.getElementById("targetLabel");
const timeLabel = document.getElementById("timeLabel");
const storyLine = document.getElementById("storyLine");

const startOverlay = document.getElementById("startOverlay");
const resultOverlay = document.getElementById("resultOverlay");
const nameInput = document.getElementById("nameInput");
const newGameBtn = document.getElementById("newGameBtn");
const continueBtn = document.getElementById("continueBtn");
const overlayHint = document.getElementById("overlayHint");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const restartBtn = document.getElementById("restartBtn");
const levelBanner = document.getElementById("levelBanner");

const SPRITE_PATHS = {
  g5: "../Group%205.svg",
  g6: "../Group%206.svg",
  g7: "../Group%207.svg",
  g8: "../Group%208.svg",
  g9: "../Group%209.svg",
  g10: "../Group%2010.svg",
};

const LEVELS = [
  {
    id: 1,
    name: "Turbo Port",
    story: "Collect 8 modules and evade basic drones.",
    bg: ["#173f5f", "#20639b", "#3caea3"],
    targets: 8,
    enemies: 3,
    enemySpeed: 1.8,
    time: 65,
    playerSprite: "g5",
    collectibleSprite: "g8",
    enemySprites: ["g6", "g7", "g9"],
  },
  {
    id: 2,
    name: "Desert Drift",
    story: "A heatstorm boosts drone speed. Secure 10 capsules.",
    bg: ["#5f0f40", "#9a031e", "#fb8b24"],
    targets: 10,
    enemies: 4,
    enemySpeed: 2.1,
    time: 60,
    playerSprite: "g6",
    collectibleSprite: "g9",
    enemySprites: ["g5", "g7", "g10"],
  },
  {
    id: 3,
    name: "Neon Rift",
    story: "A maze of city rooftops. Gather 12 energy cores.",
    bg: ["#113537", "#37505c", "#44524a"],
    targets: 12,
    enemies: 5,
    enemySpeed: 2.35,
    time: 58,
    playerSprite: "g7",
    collectibleSprite: "g10",
    enemySprites: ["g5", "g6", "g8", "g9"],
  },
  {
    id: 4,
    name: "Storm Canyon",
    story: "Crosswinds push you off course. Capture 14 beacons.",
    bg: ["#2c3e50", "#4ca1af", "#8bc6ec"],
    targets: 14,
    enemies: 6,
    enemySpeed: 2.6,
    time: 56,
    playerSprite: "g8",
    collectibleSprite: "g6",
    enemySprites: ["g5", "g7", "g9", "g10"],
  },
  {
    id: 5,
    name: "Titan Orbit",
    story: "Final stage. Survive elite hunters and recover 16 artifacts.",
    bg: ["#0b132b", "#1c2541", "#3a506b"],
    targets: 16,
    enemies: 7,
    enemySpeed: 2.95,
    time: 54,
    playerSprite: "g10",
    collectibleSprite: "g5",
    enemySprites: ["g6", "g7", "g8", "g9"],
  },
];

const game = {
  playerName: "",
  level: 1,
  score: 0,
  lives: 3,
  streak: 0,
  running: false,
  countdown: 0,
  lastTick: 0,
  autoSaveElapsed: 0,
  keys: {},
  player: { x: 100, y: 280, w: 54, h: 54, speed: 4.3 },
  enemies: [],
  collectibles: [],
  playerImage: null,
  saveDebounce: null,
};

const images = {};

function loadImages() {
  const entries = Object.entries(SPRITE_PATHS);
  return Promise.all(
    entries.map(([key, src]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ key, img });
        img.onerror = () => resolve({ key, img: null });
        img.src = src;
      });
    }),
  ).then((loaded) => {
    loaded.forEach((entry) => {
      images[entry.key] = entry.img;
    });
  });
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function currentLevelConfig() {
  return LEVELS[game.level - 1];
}

function normalizePlayerName() {
  return nameInput.value.trim().slice(0, 32);
}

function setOverlayMessage(message, isError = false) {
  overlayHint.textContent = message;
  overlayHint.style.color = isError ? "#ffacb6" : "#9ed0ff";
}

function showBanner(text) {
  levelBanner.textContent = text;
  levelBanner.classList.remove("hidden");
  setTimeout(() => levelBanner.classList.add("hidden"), 2100);
}

function spawnCollectibles(config) {
  const result = [];
  for (let i = 0; i < config.targets; i += 1) {
    result.push({
      x: randomBetween(120, canvas.width - 80),
      y: randomBetween(50, canvas.height - 70),
      w: 38,
      h: 38,
      collected: false,
    });
  }
  return result;
}

function spawnEnemies(config) {
  const result = [];
  for (let i = 0; i < config.enemies; i += 1) {
    const spriteKey = config.enemySprites[i % config.enemySprites.length];
    result.push({
      x: randomBetween(180, canvas.width - 90),
      y: randomBetween(40, canvas.height - 80),
      w: 46,
      h: 46,
      vx: randomBetween(-config.enemySpeed, config.enemySpeed) || config.enemySpeed,
      vy: randomBetween(-config.enemySpeed, config.enemySpeed) || -config.enemySpeed,
      spriteKey,
      hitCooldown: 0,
    });
  }
  return result;
}

function isIntersecting(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function updateHUD() {
  const config = currentLevelConfig();
  nameLabel.textContent = game.playerName || "-";
  levelLabel.textContent = `${game.level} / ${LEVELS.length}`;
  scoreLabel.textContent = String(game.score);
  livesLabel.textContent = String(game.lives);
  targetLabel.textContent = `${game.collectibles.filter((item) => !item.collected).length}`;
  timeLabel.textContent = `${Math.ceil(game.countdown)}`;
  storyLine.textContent = config.story;
}

function drawBackground(config) {
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, config.bg[0]);
  grad.addColorStop(0.55, config.bg[1]);
  grad.addColorStop(1, config.bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    ctx.arc(70 + i * 68, 100 + (i % 4) * 112, 34 + (i % 3) * 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEntity(entity, sprite, fallbackColor) {
  if (sprite) {
    ctx.drawImage(sprite, entity.x, entity.y, entity.w, entity.h);
    return;
  }

  ctx.fillStyle = fallbackColor;
  ctx.fillRect(entity.x, entity.y, entity.w, entity.h);
}

function drawGame() {
  const config = currentLevelConfig();
  drawBackground(config);

  game.collectibles.forEach((item) => {
    if (!item.collected) {
      drawEntity(item, images[config.collectibleSprite], "#36f3b0");
    }
  });

  game.enemies.forEach((enemy) => {
    drawEntity(enemy, images[enemy.spriteKey], "#ff5d6c");
  });

  drawEntity(game.player, game.playerImage, "#ffe07a");
}

function movePlayer() {
  let dx = 0;
  let dy = 0;

  if (game.keys.ArrowUp || game.keys.KeyW) dy -= 1;
  if (game.keys.ArrowDown || game.keys.KeyS) dy += 1;
  if (game.keys.ArrowLeft || game.keys.KeyA) dx -= 1;
  if (game.keys.ArrowRight || game.keys.KeyD) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const norm = Math.hypot(dx, dy) || 1;
    game.player.x += (dx / norm) * game.player.speed;
    game.player.y += (dy / norm) * game.player.speed;
  }

  game.player.x = Math.max(0, Math.min(canvas.width - game.player.w, game.player.x));
  game.player.y = Math.max(0, Math.min(canvas.height - game.player.h, game.player.y));
}

function moveEnemies(delta) {
  game.enemies.forEach((enemy) => {
    enemy.x += enemy.vx * delta;
    enemy.y += enemy.vy * delta;

    if (enemy.x <= 0 || enemy.x + enemy.w >= canvas.width) {
      enemy.vx *= -1;
      enemy.x = Math.max(0, Math.min(canvas.width - enemy.w, enemy.x));
    }

    if (enemy.y <= 0 || enemy.y + enemy.h >= canvas.height) {
      enemy.vy *= -1;
      enemy.y = Math.max(0, Math.min(canvas.height - enemy.h, enemy.y));
    }

    if (enemy.hitCooldown > 0) {
      enemy.hitCooldown -= delta;
    }
  });
}

function handleCollectibles() {
  game.collectibles.forEach((item) => {
    if (!item.collected && isIntersecting(game.player, item)) {
      item.collected = true;
      game.score += 120 + game.streak * 5;
      game.streak += 1;
    }
  });
}

function handleEnemyCollisions() {
  game.enemies.forEach((enemy) => {
    if (enemy.hitCooldown <= 0 && isIntersecting(game.player, enemy)) {
      enemy.hitCooldown = 0.8;
      game.lives -= 1;
      game.streak = 0;
      game.score = Math.max(0, game.score - 80);
      game.player.x = 70;
      game.player.y = canvas.height / 2;
      queueSave();
    }
  });
}

function queueSave() {
  clearTimeout(game.saveDebounce);
  game.saveDebounce = setTimeout(() => {
    saveProgress();
  }, 300);
}

async function saveProgress() {
  if (!game.playerName) {
    return;
  }

  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: game.playerName,
        progress: {
          level: game.level,
          score: game.score,
          lives: game.lives,
          streak: game.streak,
        },
      }),
    });
  } catch (error) {
    // Ignore short offline/network save failures and continue game loop.
  }
}

async function fetchProgress(name) {
  const response = await fetch(`/api/progress/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error("Failed to load progress");
  }
  return response.json();
}

function setupLevel() {
  const config = currentLevelConfig();
  game.playerImage = images[config.playerSprite];
  game.player.x = 70;
  game.player.y = canvas.height / 2;
  game.countdown = config.time;
  game.collectibles = spawnCollectibles(config);
  game.enemies = spawnEnemies(config);
  showBanner(`Level ${config.id}: ${config.name}`);
  updateHUD();
}

function loseGame(reasonText) {
  game.running = false;
  resultTitle.textContent = "Mission Failed";
  resultText.textContent = `${reasonText} Final score: ${game.score}.`;
  resultOverlay.classList.remove("hidden");
  saveProgress();
}

function winGame() {
  game.running = false;
  resultTitle.textContent = "Victory";
  resultText.textContent = `You cleared all 5 levels. Total score: ${game.score}.`;
  resultOverlay.classList.remove("hidden");
  game.level = 1;
  saveProgress();
}

function advanceLevel() {
  game.level += 1;
  if (game.level > LEVELS.length) {
    winGame();
    return;
  }

  game.lives = Math.min(5, game.lives + 1);
  setupLevel();
  queueSave();
}

function tick(now) {
  if (!game.running) {
    return;
  }

  if (!game.lastTick) {
    game.lastTick = now;
  }

  const delta = Math.min((now - game.lastTick) / 16.67, 2.4);
  game.lastTick = now;

  movePlayer();
  moveEnemies(delta);
  handleCollectibles();
  handleEnemyCollisions();

  game.countdown -= delta / 60;
  game.autoSaveElapsed += delta;

  if (game.autoSaveElapsed >= 180) {
    game.autoSaveElapsed = 0;
    queueSave();
  }

  if (game.lives <= 0) {
    loseGame("You ran out of lives.");
    return;
  }

  if (game.countdown <= 0) {
    loseGame("Level time is up.");
    return;
  }

  if (game.collectibles.every((item) => item.collected)) {
    game.score += 260;
    advanceLevel();
  }

  updateHUD();
  drawGame();
  requestAnimationFrame(tick);
}

function startGame(progress) {
  game.level = Math.max(1, Math.min(LEVELS.length, Number(progress?.level) || 1));
  game.score = Number(progress?.score) || 0;
  game.lives = Math.max(1, Number(progress?.lives) || 3);
  game.streak = Number(progress?.streak) || 0;
  game.running = true;
  game.lastTick = 0;
  game.autoSaveElapsed = 0;

  startOverlay.classList.add("hidden");
  resultOverlay.classList.add("hidden");

  setupLevel();
  saveProgress();
  requestAnimationFrame(tick);
}

async function checkContinueAvailability() {
  const name = normalizePlayerName();
  continueBtn.disabled = true;

  if (!name) {
    setOverlayMessage("Enter your name to start.");
    return;
  }

  try {
    const payload = await fetchProgress(name);
    if (payload.found) {
      continueBtn.disabled = false;
      const level = payload.progress.level || 1;
      setOverlayMessage(`Save found: level ${level}, score ${payload.progress.score || 0}.`);
    } else {
      setOverlayMessage("No save found, you can start a new game.");
    }
  } catch (error) {
    setOverlayMessage("Could not check save data. Try again.", true);
  }
}

newGameBtn.addEventListener("click", async () => {
  const name = normalizePlayerName();
  if (!name) {
    setOverlayMessage("Name cannot be empty.", true);
    return;
  }

  game.playerName = name;
  startGame({ level: 1, score: 0, lives: 3, streak: 0 });
});

continueBtn.addEventListener("click", async () => {
  const name = normalizePlayerName();
  if (!name) {
    setOverlayMessage("Enter your name.", true);
    return;
  }

  try {
    const payload = await fetchProgress(name);
    if (!payload.found) {
      setOverlayMessage("Save not found.", true);
      return;
    }

    game.playerName = name;
    startGame(payload.progress);
  } catch (error) {
    setOverlayMessage("Failed to load save data.", true);
  }
});

restartBtn.addEventListener("click", () => {
  resultOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
  continueBtn.disabled = true;
  setOverlayMessage("Enter your name for a new run or continue.");
  drawIdleScreen();
});

nameInput.addEventListener("input", () => {
  checkContinueAvailability();
});

window.addEventListener("keydown", (event) => {
  game.keys[event.code] = true;
});

window.addEventListener("keyup", (event) => {
  game.keys[event.code] = false;
});

window.addEventListener("beforeunload", () => {
  saveProgress();
});

function drawIdleScreen() {
  ctx.fillStyle = "#0a101a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f2f7ff";
  ctx.font = "700 42px Exo 2";
  ctx.fillText("Skyline Relay", 44, 92);
  ctx.font = "500 26px Exo 2";
  ctx.fillStyle = "#b4cbe0";
  ctx.fillText("WASD / Arrow Keys: move", 44, 152);
  ctx.fillText("Goal: collect artifacts and avoid collisions", 44, 194);
}

async function init() {
  await loadImages();
  drawIdleScreen();
  setOverlayMessage("Enter your name and choose a start mode.");
}

init();
