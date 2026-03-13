const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const gameStageEl = document.getElementById("gameStage");

const CANVAS_BASE_WIDTH = canvas.width;
const CANVAS_BASE_HEIGHT = canvas.height;
const CANVAS_ASPECT = CANVAS_BASE_WIDTH / CANVAS_BASE_HEIGHT;

const livesEl = document.getElementById("lives");
const coinsEl = document.getElementById("coins");
const stonesEl = document.getElementById("stones");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const levelNameEl = document.getElementById("levelName");
const powerEl = document.getElementById("power");
const checkpointEl = document.getElementById("checkpoint");
const weatherEl = document.getElementById("weather");
const challengeEl = document.getElementById("challenge");
const bossEl = document.getElementById("boss");
const restartBtn = document.getElementById("restart");

function fitCanvasToStage() {
  if (!gameStageEl) {
    return;
  }

  const bounds = gameStageEl.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  const safeW = Math.max(0, bounds.width - 4);
  const safeH = Math.max(0, bounds.height - 4);

  let targetW = safeW;
  let targetH = targetW / CANVAS_ASPECT;

  if (targetH > safeH) {
    targetH = safeH;
    targetW = targetH * CANVAS_ASPECT;
  }

  const pxW = Math.max(320, Math.floor(targetW));
  const pxH = Math.max(180, Math.floor(targetH));

  canvas.style.width = `${pxW}px`;
  canvas.style.height = `${pxH}px`;
}

const GRAVITY_BASE = 0.6;
const MOVE_SPEED_BASE = 4;
const JUMP_FORCE_BASE = -11.8;
const WORLD_WIDTH = 3600;
const PLAYER_BASE_W = 34;
const PLAYER_BASE_H = 50;
const PLAYER_MAX_W = 52;
const PLAYER_MAX_H = 74;
const DASH_SPEED = 10.5;
const DASH_DURATION = 170;
const DASH_COOLDOWN = 1300;
const MAGNET_RADIUS = 180;
const SPEED_RUN_TARGET = 95;
const STONE_SPEED = 9.2;
const STONE_COOLDOWN = 120;
const SLOW_TIME_DURATION = 3500;
const SLOW_TIME_COOLDOWN = 9000;
const MEGA_JUMP_FORCE = -16.8;
const MEGA_JUMP_COOLDOWN = 2600;
const GRAVI_DURATION = 2600;
const GRAVI_COOLDOWN = 8500;
const CLONE_DURATION = 4500;
const CLONE_COOLDOWN = 9000;
const LASER_DURATION = 180;
const LASER_COOLDOWN = 2200;
const LASER_RANGE = 270;

const playerSprite = new Image();
playerSprite.src = "mario 2.svg";

const enemySprites = ["mario 1.svg", "mario 3.svg", "mario 4.svg"].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

const ghostStorageKey = "plumber-quest-ghost-run";
let bestGhost = [];
let bestTime = null;

try {
  const raw = localStorage.getItem(ghostStorageKey);
  if (raw) {
    const parsed = JSON.parse(raw);
    bestGhost = Array.isArray(parsed.frames) ? parsed.frames : [];
    bestTime = Number.isFinite(parsed.time) ? parsed.time : null;
  }
} catch (_) {
  bestGhost = [];
  bestTime = null;
}

const keys = {
  left: false,
  right: false,
  jump: false,
  down: false,
  dash: false,
  throwStone: false,
  slowTime: false,
  megaJump: false,
  graviShift: false,
  cloneCast: false,
  laser: false,
};

const level = {
  name: "1-1",
  groundY: 470,
  platforms: [
    { x: 180, y: 400, w: 170, h: 24 },
    { x: 420, y: 350, w: 180, h: 24 },
    { x: 710, y: 300, w: 170, h: 24 },
    { x: 980, y: 360, w: 190, h: 24 },
    { x: 1260, y: 320, w: 160, h: 24 },
    { x: 1510, y: 280, w: 190, h: 24 },
    { x: 1840, y: 330, w: 190, h: 24 },
    { x: 2140, y: 280, w: 140, h: 24 },
    { x: 2440, y: 300, w: 170, h: 24 },
    { x: 2730, y: 250, w: 180, h: 24 },
    { x: 3000, y: 350, w: 220, h: 24 },

    // secret room platforms
    { x: 3270, y: 250, w: 200, h: 20 },
    { x: 3340, y: 175, w: 120, h: 20 },
  ],
  secretBlocks: [
    { x: 855, y: 255, w: 34, h: 34, used: false, reward: "coin" },
    { x: 1680, y: 235, w: 34, h: 34, used: false, reward: "magnet" },
    { x: 2880, y: 190, w: 34, h: 34, used: false, reward: "doubleJump" },
  ],
  breakableBlocks: [
    { x: 330, y: 230, w: 34, h: 34, broken: false, reward: "coin" },
    { x: 720, y: 210, w: 34, h: 34, broken: false, reward: "coin" },
    { x: 1110, y: 240, w: 34, h: 34, broken: false, reward: "grow" },
    { x: 1680, y: 190, w: 34, h: 34, broken: false, reward: "coin" },
    { x: 2230, y: 210, w: 34, h: 34, broken: false, reward: "coin" },
    { x: 2790, y: 160, w: 34, h: 34, broken: false, reward: "coin" },
  ],
  coins: [
    { x: 250, y: 350, taken: false, secret: false },
    { x: 520, y: 300, taken: false, secret: false },
    { x: 790, y: 250, taken: false, secret: false },
    { x: 1080, y: 310, taken: false, secret: false },
    { x: 1330, y: 270, taken: false, secret: false },
    { x: 1590, y: 230, taken: false, secret: false },
    { x: 1910, y: 280, taken: false, secret: false },
    { x: 2200, y: 230, taken: false, secret: false },
    { x: 3320, y: 215, taken: false, secret: true },
    { x: 3380, y: 215, taken: false, secret: true },
    { x: 3440, y: 215, taken: false, secret: true },
  ],
  powerUps: [],
  enemies: [
    { x: 620, y: 438, w: 34, h: 32, minX: 560, maxX: 760, vx: 1.2, alive: true },
    { x: 1430, y: 438, w: 34, h: 32, minX: 1360, maxX: 1540, vx: 1.4, alive: true },
    { x: 1980, y: 438, w: 34, h: 32, minX: 1910, maxX: 2060, vx: 1.3, alive: true },
    { x: 2520, y: 438, w: 34, h: 32, minX: 2450, maxX: 2630, vx: 1.6, alive: true },
  ],
  checkpoints: [
    { x: 930, y: 430, reached: false, name: "CP-1" },
    { x: 1820, y: 430, reached: false, name: "CP-2" },
    { x: 2820, y: 430, reached: false, name: "CP-3" },
  ],
  jumpPads: [
    { x: 1180, y: 452, w: 64, h: 18 },
    { x: 2360, y: 452, w: 64, h: 18 },
  ],
  secretEntrance: { x: 1720, y: 438, w: 40, h: 32, discovered: false },
  secretRoomExit: { x: 3460, y: 220, w: 36, h: 30 },
  goal: { x: 3480, y: 330, w: 40, h: 140 },
};

const boss = {
  x: 3160,
  y: 402,
  w: 86,
  h: 68,
  vx: 1.7,
  minX: 3040,
  maxX: 3380,
  hp: 3,
  maxHp: 3,
  active: false,
  defeated: false,
  dashUntil: 0,
  nextDashAt: 0,
  nextShootAt: 0,
  disabled: false,
};

const weather = {
  type: "clear",
  wind: 0,
  nextChangeAt: 0,
};

const player = {
  x: 60,
  y: 420,
  w: PLAYER_BASE_W,
  h: PLAYER_BASE_H,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  lives: 3,
  coins: 0,
  score: 0,
  invulnerableUntil: 0,
  hasDoubleJump: false,
  jumpsLeft: 1,
  stones: 8,
  slowUntil: 0,
  slowReadyAt: 0,
  graviUntil: 0,
  graviReadyAt: 0,
  megaJumpReadyAt: 0,
  cloneReadyAt: 0,
  laserReadyAt: 0,
  laserUntil: 0,
  throwReadyAt: 0,
  dashReadyAt: 0,
  dashUntil: 0,
  dashDir: 1,
  shieldCharges: 0,
  powerTimers: {
    magnet: 0,
    speed: 0,
    jump: 0,
  },
  respawnX: 60,
  respawnY: 420,
  inSecretRoom: false,
  returnFromSecret: { x: 1750, y: 410 },
};

const challenges = {
  noDamage: true,
  pacifist: true,
};

let stompCombo = 0;
let lastStompAt = 0;
let gameOver = false;
let won = false;
let cameraX = 0;
let runStartAt = 0;
let runTime = 0;
let runFrames = [];
let projectiles = [];
let particles = [];
let coinDrops = [];
let activeClone = null;

function resetWorld() {
  player.x = 60;
  player.y = 420;
  player.w = PLAYER_BASE_W;
  player.h = PLAYER_BASE_H;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.facing = 1;
  player.lives = 3;
  player.coins = 0;
  player.score = 0;
  player.invulnerableUntil = 0;
  player.hasDoubleJump = false;
  player.jumpsLeft = 1;
  player.stones = 999;
  player.slowUntil = 0;
  player.slowReadyAt = 0;
  player.graviUntil = 0;
  player.graviReadyAt = 0;
  player.megaJumpReadyAt = 0;
  player.cloneReadyAt = 0;
  player.laserReadyAt = 0;
  player.laserUntil = 0;
  player.throwReadyAt = 0;
  player.dashReadyAt = 0;
  player.dashUntil = 0;
  player.dashDir = 1;
  player.shieldCharges = 0;
  player.powerTimers.magnet = 0;
  player.powerTimers.speed = 0;
  player.powerTimers.jump = 0;
  player.respawnX = 60;
  player.respawnY = 420;
  player.inSecretRoom = false;
  player.returnFromSecret.x = 1750;
  player.returnFromSecret.y = 410;

  for (const c of level.coins) c.taken = false;
  for (const p of level.powerUps) p.taken = false;
  for (const s of level.secretBlocks) s.used = false;
  for (const b of level.breakableBlocks) b.broken = false;
  for (const cp of level.checkpoints) cp.reached = false;
  for (const e of level.enemies) e.alive = true;
  level.secretEntrance.discovered = false;

  level.enemies[0].x = 620;
  level.enemies[1].x = 1430;
  level.enemies[2].x = 1980;
  level.enemies[3].x = 2520;

  boss.x = 3160;
  boss.y = 402;
  boss.vx = 1.7;
  boss.hp = boss.maxHp;
  boss.active = false;
  boss.defeated = false;
  boss.dashUntil = 0;
  boss.nextDashAt = performance.now() + 2500;
  boss.nextShootAt = performance.now() + 3000;

  weather.type = "clear";
  weather.wind = 0;
  weather.nextChangeAt = performance.now() + 17000;

  challenges.noDamage = true;
  challenges.pacifist = true;

  stompCombo = 0;
  lastStompAt = 0;
  gameOver = false;
  won = false;
  cameraX = 0;
  runStartAt = performance.now();
  runTime = 0;
  runFrames = [];
  projectiles = [];
  particles = [];
  coinDrops = [];
  activeClone = null;

  updateHud();
}

function updateHud() {
  const setHudText = (el, value) => {
    if (el) {
      el.textContent = String(value);
    }
  };

  const now = performance.now();
  setHudText(livesEl, player.lives);
  setHudText(coinsEl, player.coins);
  setHudText(stonesEl, "INF");
  setHudText(scoreEl, player.score);
  runTime = (now - runStartAt) / 1000;
  setHudText(timeEl, runTime.toFixed(1));
  setHudText(levelNameEl, level.name);

  const powers = [];
  if (player.shieldCharges > 0) powers.push("shield");
  if (now < player.powerTimers.magnet) powers.push("magnet");
  if (now < player.powerTimers.speed) powers.push("speed boost");
  if (now < player.powerTimers.jump) powers.push("high jump");
  if (player.hasDoubleJump) powers.push("double jump");
  if (player.w > PLAYER_BASE_W) powers.push("big form");
  setHudText(powerEl, powers.length ? powers.join(", ") : "none");

  const reachedCp = level.checkpoints.findLast((cp) => cp.reached);
  setHudText(checkpointEl, reachedCp ? reachedCp.name : "start");

  const weatherMap = {
    clear: "clear",
    rain: "rain",
    wind: "wind",
    fog: "fog",
  };
  setHudText(weatherEl, weatherMap[weather.type]);

  const totalCoins = level.coins.length;
  const challengeDone = [];
  if (challenges.noDamage) challengeDone.push("no damage");
  if (player.coins === totalCoins) challengeDone.push("all coins");
  if (runTime <= SPEED_RUN_TARGET && won) challengeDone.push("speedrun");
  if (challenges.pacifist) challengeDone.push("pacifist");
  setHudText(
    challengeEl,
    won ? `${challengeDone.length}/4 completed` : `${challengeDone.length}/4`
  );

  if (boss.disabled) {
    setHudText(bossEl, "none");
  } else if (boss.defeated) {
    setHudText(bossEl, "defeated");
  } else if (boss.active) {
    setHudText(bossEl, `HP ${boss.hp}/${boss.maxHp}`);
  } else {
    setHudText(bossEl, "waiting");
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function activeMoveSpeed(now) {
  const speedBoost = now < player.powerTimers.speed ? 1.45 : 1;
  const weatherNerf = weather.type === "rain" ? 0.9 : 1;
  return MOVE_SPEED_BASE * speedBoost * weatherNerf;
}

function activeJumpForce(now) {
  return now < player.powerTimers.jump ? JUMP_FORCE_BASE * 1.2 : JUMP_FORCE_BASE;
}

function hurtPlayer() {
  const now = performance.now();
  if (now < player.invulnerableUntil) {
    return;
  }

  if (player.shieldCharges > 0) {
    player.shieldCharges -= 1;
    player.invulnerableUntil = now + 600;
    return;
  }

  challenges.noDamage = false;
  player.lives -= 1;
  player.invulnerableUntil = now + 1300;

  if (player.lives <= 0) {
    gameOver = true;
  } else {
    player.x = player.respawnX;
    player.y = player.respawnY;
    player.vx = 0;
    player.vy = -3;
    player.inSecretRoom = false;
  }

  updateHud();
}

function tryDash(now) {
  if (!keys.dash || now < player.dashReadyAt) {
    return;
  }
  player.dashDir = keys.left && !keys.right ? -1 : keys.right && !keys.left ? 1 : player.facing;
  player.dashUntil = now + DASH_DURATION;
  player.dashReadyAt = now + DASH_COOLDOWN;
}

function tryThrowStone(now) {
  if (!keys.throwStone || now < player.throwReadyAt) {
    return;
  }

  const dir = player.facing || 1;
  const startX = player.x + (dir === 1 ? player.w + 2 : -8);
  const startY = player.y + player.h * 0.45;

  projectiles.push({
    x: startX,
    y: startY,
    vx: dir * STONE_SPEED,
    vy: 0,
    r: 5,
    alive: true,
  });

  player.throwReadyAt = now + STONE_COOLDOWN;
  keys.throwStone = false;
}

function handleInput(now) {
  const moveSpeed = activeMoveSpeed(now);
  const gravityDir = now < player.graviUntil ? -1 : 1;

  if (keys.left && !keys.right) {
    player.vx = -moveSpeed;
    player.facing = -1;
  } else if (keys.right && !keys.left) {
    player.vx = moveSpeed;
    player.facing = 1;
  } else {
    player.vx = 0;
  }

  if (keys.jump && player.jumpsLeft > 0) {
    player.vy = activeJumpForce(now) * gravityDir;
    player.onGround = false;
    player.jumpsLeft -= 1;
    keys.jump = false;
  }

  tryDash(now);
  tryThrowStone(now);

  if (keys.slowTime && now >= player.slowReadyAt) {
    player.slowUntil = now + SLOW_TIME_DURATION;
    player.slowReadyAt = now + SLOW_TIME_COOLDOWN;
    keys.slowTime = false;
    spawnParticles(player.x + player.w * 0.5, player.y + player.h * 0.5, "#80edff", 20, 3.2);
  }

  if (keys.graviShift && now >= player.graviReadyAt) {
    player.graviUntil = now + GRAVI_DURATION;
    player.graviReadyAt = now + GRAVI_COOLDOWN;
    keys.graviShift = false;
    spawnParticles(player.x + player.w * 0.5, player.y + player.h * 0.5, "#9bf6ff", 18, 3.5);
  }

  if (keys.megaJump && now >= player.megaJumpReadyAt && player.onGround) {
    player.vy = MEGA_JUMP_FORCE * gravityDir;
    player.onGround = false;
    player.megaJumpReadyAt = now + MEGA_JUMP_COOLDOWN;
    keys.megaJump = false;
    spawnParticles(player.x + player.w * 0.5, player.y + player.h, "#c77dff", 14, 2.6);
  }

  if (keys.cloneCast && now >= player.cloneReadyAt && runFrames.length > 10) {
    const frames = runFrames.slice(Math.max(0, runFrames.length - 260));
    activeClone = {
      frames,
      idx: 0,
      expiresAt: now + CLONE_DURATION,
      x: player.x,
      y: player.y,
      facing: player.facing,
    };
    player.cloneReadyAt = now + CLONE_COOLDOWN;
    keys.cloneCast = false;
    spawnParticles(player.x + player.w * 0.5, player.y + player.h * 0.5, "#9d4edd", 20, 3.6);
  }

  if (keys.laser && now >= player.laserReadyAt) {
    player.laserReadyAt = now + LASER_COOLDOWN;
    player.laserUntil = now + LASER_DURATION;
    keys.laser = false;

    for (const enemy of level.enemies) {
      if (!enemy.alive) continue;
      const forward = player.facing === 1
        ? enemy.x > player.x && enemy.x - player.x < LASER_RANGE
        : enemy.x < player.x && player.x - enemy.x < LASER_RANGE;
      const sameBand = Math.abs(enemy.y - player.y) < 52;
      if (forward && sameBand) {
        enemy.alive = false;
        challenges.pacifist = false;
        addScore(180);
        spawnParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, "#f94144", 14, 3.1);
      }
    }
  }

  if (now < player.dashUntil) {
    player.vx = player.dashDir * DASH_SPEED;
    player.vy = Math.min(player.vy, 0.6);
  }
}

function spawnParticles(x, y, color, count, speed = 3) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const v = speed * (0.55 + Math.random() * 0.7);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 24 + Math.floor(Math.random() * 18),
      color,
      size: 2 + Math.random() * 2.5,
    });
  }
}

function activateSecretBlock(block) {
  if (block.used) {
    return;
  }

  block.used = true;
  spawnParticles(block.x + block.w * 0.5, block.y + block.h * 0.5, "#ffd166", 10, 2.8);

  if (block.reward === "coin") {
    player.coins += 2;
    addScore(120);
  }

  if (block.reward === "magnet") {
    player.powerTimers.magnet = performance.now() + 11000;
  }

  if (block.reward === "doubleJump") {
    player.hasDoubleJump = true;
  }

  updateHud();
}

function shatterBreakableBlock(block) {
  block.broken = true;
  spawnParticles(block.x + block.w * 0.5, block.y + block.h * 0.5, "#f4a261", 18, 3.8);

  if (block.reward === "grow") {
    const oldH = player.h;
    player.w = Math.min(PLAYER_MAX_W, player.w + 6);
    player.h = Math.min(PLAYER_MAX_H, player.h + 8);
    player.y -= Math.max(0, player.h - oldH);
    addScore(220);
    spawnParticles(player.x + player.w * 0.5, player.y + player.h * 0.5, "#9b5de5", 22, 4.3);
    return;
  }

  const drops = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < drops; i++) {
    coinDrops.push({
      x: block.x + block.w * 0.5 + (Math.random() * 10 - 5),
      y: block.y,
      vx: Math.random() * 2.4 - 1.2,
      vy: -4.8 - Math.random() * 1.5,
      r: 8,
      life: 330,
      taken: false,
    });
  }
}

function resolveSecretBlocks(prevY) {
  for (const block of level.secretBlocks) {
    if (block.used) continue;

    const hitHoriz = player.x + player.w > block.x && player.x < block.x + block.w;
    const wasBelow = prevY >= block.y + block.h;
    const nowAtBottom = player.y <= block.y + block.h;
    const jumpingUp = player.vy < 0;

    if (hitHoriz && wasBelow && nowAtBottom && jumpingUp) {
      player.vy = 2.6;
      activateSecretBlock(block);
    }
  }
}

function resolveBreakableBlocks(prevY) {
  for (const block of level.breakableBlocks) {
    if (block.broken) continue;

    const hitHoriz = player.x + player.w > block.x && player.x < block.x + block.w;
    const wasBelow = prevY >= block.y + block.h;
    const nowAtBottom = player.y <= block.y + block.h;
    const jumpingUp = player.vy < 0;

    if (hitHoriz && wasBelow && nowAtBottom && jumpingUp) {
      player.vy = 2.2;
      shatterBreakableBlock(block);
    }
  }
}

function applyPhysics(now) {
  const prevY = player.y;
  const gravityScale = weather.type === "rain" ? 1.08 : 1;
  const inverted = now < player.graviUntil;
  const gravityDir = inverted ? -1 : 1;

  player.x += player.vx;
  player.x = Math.max(0, Math.min(WORLD_WIDTH - player.w, player.x));

  player.vy += GRAVITY_BASE * gravityScale * gravityDir;
  player.y += player.vy;
  player.onGround = false;

  if (!inverted) {
    if (player.y + player.h >= level.groundY) {
      player.y = level.groundY - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  } else if (player.y <= 20) {
    player.y = 20;
    player.vy = 0;
    player.onGround = true;
  }

  for (const p of level.platforms) {
    const hitHoriz = player.x + player.w > p.x && player.x < p.x + p.w;
    if (!inverted) {
      const wasAbove = prevY + player.h <= p.y;
      const nowBelowTop = player.y + player.h >= p.y;
      if (hitHoriz && wasAbove && nowBelowTop && player.vy >= 0) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    } else {
      const wasBelow = prevY >= p.y + p.h;
      const nowAboveBottom = player.y <= p.y + p.h;
      if (hitHoriz && wasBelow && nowAboveBottom && player.vy <= 0) {
        player.y = p.y + p.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  if (player.onGround) {
    player.jumpsLeft = player.hasDoubleJump ? 2 : 1;
    stompCombo = 0;
  }

  for (const pad of level.jumpPads) {
    const onPad =
      !inverted &&
      player.x + player.w > pad.x &&
      player.x < pad.x + pad.w &&
      player.y + player.h >= pad.y &&
      player.y + player.h <= pad.y + pad.h + 10 &&
      player.vy >= 0;
    if (onPad) {
      player.y = pad.y - player.h;
      player.vy = -15.4;
      player.onGround = false;
      spawnParticles(pad.x + pad.w * 0.5, pad.y, "#ffbe0b", 16, 3.4);
    }
  }

  resolveSecretBlocks(prevY);
  resolveBreakableBlocks(prevY);

  if ((!inverted && player.y > canvas.height + 110) || (inverted && player.y < -160)) {
    hurtPlayer();
    player.y = player.respawnY;
  }

  // secret room entrance
  if (!player.inSecretRoom && rectsOverlap(player, level.secretEntrance)) {
    level.secretEntrance.discovered = true;
    if (keys.down) {
      player.returnFromSecret.x = player.x;
      player.returnFromSecret.y = 400;
      player.x = 3330;
      player.y = 200;
      player.inSecretRoom = true;
    }
  }

  // secret room exit
  if (player.inSecretRoom && rectsOverlap(player, level.secretRoomExit) && keys.down) {
    player.x = player.returnFromSecret.x;
    player.y = player.returnFromSecret.y;
    player.inSecretRoom = false;
  }

  if (!boss.disabled && player.x > 2920 && !boss.defeated) {
    boss.active = true;
  }

  if (!boss.disabled && boss.active && !boss.defeated) {
    level.goal.x = 3540;
  }

  updateHud();
}

function updateCheckpoints() {
  for (const cp of level.checkpoints) {
    if (!cp.reached && player.x + player.w / 2 >= cp.x) {
      cp.reached = true;
      player.respawnX = cp.x;
      player.respawnY = 390;
    }
  }
}

function addScore(points) {
  player.score += points;
}

function handleStompKill(enemy) {
  const now = performance.now();
  if (now - lastStompAt < 800) {
    stompCombo += 1;
  } else {
    stompCombo = 1;
  }
  lastStompAt = now;

  const comboMult = Math.min(8, Math.pow(2, stompCombo - 1));
  addScore(100 * comboMult);

  enemy.alive = false;
  player.vy = -9;
  challenges.pacifist = false;
  spawnParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, "#ffb703", 16, 3.2);
}

function updateEnemies(now) {
  const slowFactor = now < player.slowUntil ? 0.35 : 1;
  for (const enemy of level.enemies) {
    if (!enemy.alive) continue;

    if (activeClone && now < activeClone.expiresAt && Math.abs(enemy.x - activeClone.x) < 200) {
      enemy.vx = Math.sign(activeClone.x - enemy.x) * Math.max(1.1, Math.abs(enemy.vx));
    }

    enemy.x += enemy.vx * slowFactor;
    if (enemy.x <= enemy.minX || enemy.x + enemy.w >= enemy.maxX) {
      enemy.vx *= -1;
    }

    const hit = rectsOverlap(player, enemy);
    if (!hit) continue;

    const playerFeet = player.y + player.h;
    const enemyHead = enemy.y + 8;

    if (player.vy > 0 && playerFeet - player.vy <= enemyHead) {
      handleStompKill(enemy);
    } else {
      hurtPlayer();
    }
  }
}

function updateProjectiles(now) {
  const slowFactor = now < player.slowUntil ? 0.45 : 1;
  for (const p of projectiles) {
    if (!p.alive) continue;

    p.x += p.vx * slowFactor;
    if (p.vy) p.y += p.vy * slowFactor;

    if (p.x < -50 || p.x > WORLD_WIDTH + 50 || p.y < -80 || p.y > canvas.height + 80) {
      p.alive = false;
      continue;
    }

    if (p.fromBoss) {
      const hit = rectsOverlap(
        { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 },
        player
      );
      if (hit) {
        p.alive = false;
        hurtPlayer();
      }
      continue;
    }

    for (const enemy of level.enemies) {
      if (!enemy.alive) continue;
      const hit = rectsOverlap(
        { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 },
        enemy
      );
      if (hit) {
        enemy.alive = false;
        p.alive = false;
        challenges.pacifist = false;
        addScore(140);
        spawnParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, "#ff6b6b", 18, 3.6);
        break;
      }
    }
  }

  projectiles = projectiles.filter((p) => p.alive);
}

function updateCoinDrops() {
  for (const coin of coinDrops) {
    if (coin.taken) continue;

    coin.vy += 0.22;
    coin.x += coin.vx;
    coin.y += coin.vy;
    coin.life -= 1;

    if (coin.y + coin.r >= level.groundY) {
      coin.y = level.groundY - coin.r;
      coin.vy *= -0.45;
      coin.vx *= 0.82;
      if (Math.abs(coin.vy) < 0.8) {
        coin.vy = 0;
      }
    }

    const coinRect = { x: coin.x - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
    if (rectsOverlap(player, coinRect)) {
      coin.taken = true;
      player.coins += 1;
      addScore(60);
      spawnParticles(coin.x, coin.y, "#ffd166", 7, 2.1);
      continue;
    }

    if (coin.life <= 0) {
      coin.taken = true;
    }
  }

  coinDrops = coinDrops.filter((coin) => !coin.taken);
}

function updateParticles() {
  for (const part of particles) {
    part.x += part.vx;
    part.y += part.vy;
    part.vy += 0.12;
    part.life -= 1;
  }
  particles = particles.filter((part) => part.life > 0);
}

function updateClone(now) {
  if (!activeClone) return;
  if (now >= activeClone.expiresAt || activeClone.frames.length === 0) {
    activeClone = null;
    return;
  }

  const frame = activeClone.frames[Math.min(activeClone.idx, activeClone.frames.length - 1)];
  if (frame) {
    activeClone.x = frame.x;
    activeClone.y = frame.y;
    activeClone.facing = frame.facing;
  }
  if (activeClone.idx < activeClone.frames.length - 1) {
    activeClone.idx += 1;
  }

  for (const coin of level.coins) {
    if (coin.taken) continue;
    const coinRect = { x: coin.x - 10, y: coin.y - 10, w: 20, h: 20 };
    const cloneRect = { x: activeClone.x, y: activeClone.y, w: player.w, h: player.h };
    if (rectsOverlap(cloneRect, coinRect)) {
      coin.taken = true;
      player.coins += 1;
      addScore(55);
    }
  }
}

function updateBoss(now) {
  if (boss.disabled) return;
  if (!boss.active || boss.defeated) return;

  const phase2 = boss.hp <= boss.maxHp / 2;
  const dashCooldown = phase2 ? 1400 : 2600;
  const dashDuration = phase2 ? 780 : 650;
  const baseSpeed  = phase2 ? 2.8 : 1.7;

  const isDashing = now < boss.dashUntil;
  if (now >= boss.nextDashAt && !isDashing) {
    boss.dashUntil = now + dashDuration;
    boss.nextDashAt = now + dashCooldown;
  }

  const speed = isDashing ? (phase2 ? 6 : 4) : baseSpeed;
  boss.x += speed * Math.sign(boss.vx);

  if (boss.x <= boss.minX || boss.x + boss.w >= boss.maxX) {
    boss.vx *= -1;
  }

  // Shoot projectile at player
  const shootCooldown = phase2 ? 1600 : 2800;
  if (now >= boss.nextShootAt && Math.abs(boss.x - player.x) < 700) {
    boss.nextShootAt = now + shootCooldown;
    const cx = boss.x + boss.w * 0.5;
    const cy = boss.y + boss.h * 0.5;
    const dx = player.x + player.w * 0.5 - cx;
    const dy = player.y + player.h * 0.5 - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const projSpeed = phase2 ? 6 : 4.5;
    projectiles.push({ x: cx, y: cy, vx: (dx / dist) * projSpeed, vy: (dy / dist) * projSpeed, r: 7, alive: true, fromBoss: true });
    if (phase2) {
      // fire a second spread shot in rage phase
      projectiles.push({ x: cx, y: cy, vx: (dx / dist) * projSpeed * 0.8 + 1.5, vy: (dy / dist) * projSpeed * 0.8 - 1, r: 6, alive: true, fromBoss: true });
    }
    spawnParticles(cx, cy, "#ef233c", 10, 2.5);
  }

  const hit = rectsOverlap(player, boss);
  if (!hit) return;

  const playerFeet = player.y + player.h;
  const bossHead = boss.y + 12;

  if (player.vy > 0 && playerFeet - player.vy <= bossHead) {
    boss.hp -= 1;
    addScore(250);
    player.vy = -10;
    player.invulnerableUntil = now + 500;
    spawnParticles(boss.x + boss.w * 0.5, boss.y, "#ef233c", 20, 3.8);
    if (boss.hp <= 0) {
      boss.defeated = true;
      boss.active = false;
      addScore(2000);
      level.goal.x = 3400;
      spawnParticles(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, "#ffd166", 50, 6);
    }
  } else {
    hurtPlayer();
  }
}

function applyMagnetToCoins() {
  const now = performance.now();
  if (now >= player.powerTimers.magnet) return;

  for (const coin of level.coins) {
    if (coin.taken) continue;
    const dx = player.x + player.w * 0.5 - coin.x;
    const dy = player.y + player.h * 0.5 - coin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < MAGNET_RADIUS && dist > 1) {
      coin.x += (dx / dist) * 2.3;
      coin.y += (dy / dist) * 2.3;
    }
  }
}

function collectCoins() {
  for (const coin of level.coins) {
    if (coin.taken) continue;

    const coinRect = { x: coin.x - 10, y: coin.y - 10, w: 20, h: 20 };
    if (rectsOverlap(player, coinRect)) {
      coin.taken = true;
      player.coins += 1;
      addScore(75);
    }
  }
}

function applyPowerUp(type) {
  const now = performance.now();
  if (type === "shield") {
    player.shieldCharges += 1;
    addScore(100);
  }
  if (type === "magnet") {
    player.powerTimers.magnet = now + 11000;
    addScore(100);
  }
  if (type === "speed") {
    player.powerTimers.speed = now + 9000;
    addScore(100);
  }
  if (type === "jump") {
    player.powerTimers.jump = now + 10000;
    addScore(100);
  }
  if (type === "doubleJump") {
    player.hasDoubleJump = true;
    addScore(300);
  }
}

function collectPowerUps() {
  for (const item of level.powerUps) {
    if (item.taken) continue;
    if (rectsOverlap(player, item)) {
      item.taken = true;
      applyPowerUp(item.type);
    }
  }
}

function updateWeather(now) {
  if (now < weather.nextChangeAt) return;

  const options = ["clear", "rain", "wind", "fog"];
  const idx = Math.floor(Math.random() * options.length);
  weather.type = options[idx];
  weather.wind = weather.type === "wind" ? (Math.random() > 0.5 ? 0.1 : -0.1) : 0;
  weather.nextChangeAt = now + 24000;
}

function checkGoal() {
  if (rectsOverlap(player, level.goal)) {
    won = true;
    const totalCoins = level.coins.length;
    const runSecs = (performance.now() - runStartAt) / 1000;
    const challengeCount = [
      challenges.noDamage,
      player.coins === totalCoins,
      runSecs <= SPEED_RUN_TARGET,
      challenges.pacifist,
    ].filter(Boolean).length;
    addScore(500 * challengeCount);

    if (bestTime === null || runSecs < bestTime) {
      bestTime = runSecs;
      bestGhost = runFrames.slice();
      try {
        localStorage.setItem(
          ghostStorageKey,
          JSON.stringify({
            time: runSecs,
            frames: bestGhost,
          })
        );
      } catch (_) {
        // Ignore storage failure.
      }
    }
  }
}

function updateCamera() {
  const target = player.x - canvas.width * 0.35;
  cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, target));
}

function drawBackground() {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGrad.addColorStop(0, "#8ecae6");
  skyGrad.addColorStop(0.45, "#bde0fe");
  skyGrad.addColorStop(1, "#e0fbfc");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const farShift = (cameraX * 0.18) % 320;
  ctx.fillStyle = "#8aa9bf";
  for (let i = -2; i < 8; i++) {
    const x = i * 320 - farShift;
    ctx.beginPath();
    ctx.moveTo(x, level.groundY);
    ctx.lineTo(x + 130, level.groundY - 180);
    ctx.lineTo(x + 250, level.groundY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + 150, level.groundY);
    ctx.lineTo(x + 280, level.groundY - 130);
    ctx.lineTo(x + 410, level.groundY);
    ctx.closePath();
    ctx.fill();
  }

  const midShift = (cameraX * 0.35) % 260;
  ctx.fillStyle = "#5f8f6c";
  for (let i = -2; i < 10; i++) {
    const x = i * 260 - midShift;
    ctx.beginPath();
    ctx.moveTo(x, level.groundY);
    ctx.lineTo(x + 70, level.groundY - 80);
    ctx.lineTo(x + 170, level.groundY);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + 120, level.groundY);
    ctx.lineTo(x + 190, level.groundY - 58);
    ctx.lineTo(x + 280, level.groundY);
    ctx.closePath();
    ctx.fill();
  }

  const cloudShift = (cameraX * 0.12) % 500;
  ctx.fillStyle = "#ffffffcc";
  for (let i = -1; i < 4; i++) {
    const baseX = i * 500 - cloudShift;
    const baseY = 70 + (i % 2) * 38;
    ctx.beginPath();
    ctx.arc(baseX + 40, baseY + 18, 18, 0, Math.PI * 2);
    ctx.arc(baseX + 62, baseY + 10, 22, 0, Math.PI * 2);
    ctx.arc(baseX + 90, baseY + 18, 20, 0, Math.PI * 2);
    ctx.arc(baseX + 66, baseY + 26, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  const groundGrad = ctx.createLinearGradient(0, level.groundY, 0, canvas.height);
  groundGrad.addColorStop(0, "#79c26d");
  groundGrad.addColorStop(1, "#4f8b4e");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, level.groundY, canvas.width, canvas.height - level.groundY);

  const stripeW = 90;
  for (let i = -1; i <= Math.ceil(canvas.width / stripeW) + 1; i++) {
    const x = i * stripeW - (cameraX * 0.8) % stripeW;
    ctx.fillStyle = i % 2 === 0 ? "#6bb560" : "#61ab56";
    ctx.fillRect(x, level.groundY, stripeW, canvas.height - level.groundY);
  }

  ctx.fillStyle = "#8d6e63";
  for (const p of level.platforms) {
    ctx.fillRect(p.x - cameraX, p.y, p.w, p.h);
    ctx.fillStyle = "#a1887f";
    ctx.fillRect(p.x - cameraX + 4, p.y + 4, p.w - 8, 6);
    ctx.fillStyle = "#8d6e63";
  }

  for (const cp of level.checkpoints) {
    const x = cp.x - cameraX;
    ctx.fillStyle = cp.reached ? "#2a9d8f" : "#adb5bd";
    ctx.fillRect(x, 340, 6, 130);
    ctx.fillStyle = cp.reached ? "#80ed99" : "#ced4da";
    ctx.beginPath();
    ctx.moveTo(x + 6, 348);
    ctx.lineTo(x + 32, 360);
    ctx.lineTo(x + 6, 372);
    ctx.closePath();
    ctx.fill();
  }

  for (const pad of level.jumpPads) {
    const x = pad.x - cameraX;
    ctx.fillStyle = "#ffbe0b";
    ctx.fillRect(x, pad.y, pad.w, pad.h);
    ctx.fillStyle = "#fb5607";
    ctx.fillRect(x + 4, pad.y + 4, pad.w - 8, 4);
  }

  if (!boss.defeated) {
    ctx.fillStyle = "#6c757d";
    ctx.fillRect(3390 - cameraX, 380, 14, 90);
  }

  for (const block of level.secretBlocks) {
    if (!block.used) continue;
    ctx.fillStyle = "#f4a261";
    ctx.fillRect(block.x - cameraX, block.y, block.w, block.h);
    ctx.fillStyle = "#e76f51";
    ctx.fillRect(block.x - cameraX + 4, block.y + 4, block.w - 8, 6);
  }

  for (const block of level.breakableBlocks) {
    if (block.broken) continue;
    const x = block.x - cameraX;
    const isGrow = block.reward === "grow";
    ctx.fillStyle = isGrow ? "#7b2cbf" : "#bc6c25";
    ctx.fillRect(x, block.y, block.w, block.h);
    ctx.fillStyle = isGrow ? "#c77dff" : "#dda15e";
    ctx.fillRect(x + 4, block.y + 4, block.w - 8, 6);
  }
}

function drawCoins() {
  for (const coin of level.coins) {
    if (coin.taken) continue;

    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(coin.x - cameraX, coin.y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = "#fca311";
    ctx.lineWidth = 3;
    ctx.arc(coin.x - cameraX, coin.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCoinDrops() {
  for (const coin of coinDrops) {
    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(coin.x - cameraX, coin.y, coin.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = "#fca311";
    ctx.lineWidth = 2;
    ctx.arc(coin.x - cameraX, coin.y, coin.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPowerUps() {
  for (const item of level.powerUps) {
    if (item.taken) continue;
    const x = item.x - cameraX;
    const colorMap = {
      shield: "#00b4d8",
      speed: "#f77f00",
      jump: "#9b5de5",
      magnet: "#2a9d8f",
    };
    ctx.fillStyle = colorMap[item.type] || "#e76f51";
    ctx.fillRect(x, item.y, item.w, item.h);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(item.type[0].toUpperCase(), x + 12, item.y + 16);
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.beginPath();
    ctx.fillStyle = p.fromBoss ? "#ef233c" : "#adb5bd";
    ctx.arc(p.x - cameraX, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = p.fromBoss ? "#9d0208" : "#6c757d";
    ctx.lineWidth = 1.5;
    ctx.arc(p.x - cameraX, p.y, p.r - 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const part of particles) {
    const alpha = Math.max(0, Math.min(1, part.life / 30));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = part.color;
    ctx.fillRect(part.x - cameraX, part.y, part.size, part.size);
    ctx.globalAlpha = 1;
  }
}

function drawEnemies() {
  for (let i = 0; i < level.enemies.length; i++) {
    const enemy = level.enemies[i];
    if (!enemy.alive) continue;

    const x = enemy.x - cameraX;
    const img = enemySprites[i % enemySprites.length];

    if (img.complete && img.naturalWidth > 0) {
      ctx.save();
      if (enemy.vx < 0) {
        ctx.translate(x + enemy.w, enemy.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, enemy.w, enemy.h);
      } else {
        ctx.drawImage(img, x, enemy.y, enemy.w, enemy.h);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "#8c564b";
      ctx.fillRect(x, enemy.y, enemy.w, enemy.h);
    }
  }
}

function drawBoss() {
  if (boss.disabled) return;
  if (boss.defeated) return;
  if (!boss.active) return;

  const x = boss.x - cameraX;
  const phase2 = boss.hp <= boss.maxHp / 2;

  // body
  ctx.fillStyle = phase2 ? "#6a0572" : "#343a40";
  ctx.fillRect(x, boss.y, boss.w, boss.h);

  // rage glow outline
  if (phase2) {
    ctx.strokeStyle = "#ef233c";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 2, boss.y - 2, boss.w + 4, boss.h + 4);
  }

  // eyes
  ctx.fillStyle = phase2 ? "#ffff00" : "#ff595e";
  ctx.fillRect(x + 10, boss.y + 14, 16, 16);
  ctx.fillRect(x + 58, boss.y + 14, 16, 16);

  // HP bar
  const hpW = 160;
  const hpX = canvas.width - 200;
  ctx.fillStyle = "#00000099";
  ctx.fillRect(hpX - 2, 14, hpW + 4, 22);
  ctx.fillStyle = phase2 ? "#9d0208" : "#ef233c";
  ctx.fillRect(hpX, 16, hpW * (boss.hp / boss.maxHp), 18);
  ctx.strokeStyle = "#f1faee";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hpX, 16, hpW, 18);

  // label
  ctx.fillStyle = phase2 ? "#ffff00" : "#f1faee";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "right";
  ctx.fillText(phase2 ? "BOSS \u2605RAGE\u2605" : `BOSS  ${boss.hp}/${boss.maxHp}`, hpX - 6, 30);
  ctx.textAlign = "left";
}

function drawGoal() {
  ctx.fillStyle = "#adb5bd";
  ctx.fillRect(level.goal.x - cameraX + 6, level.goal.y, 6, level.goal.h);
  ctx.fillStyle = "#2a9d8f";
  ctx.beginPath();
  ctx.moveTo(level.goal.x - cameraX + 12, level.goal.y + 5);
  ctx.lineTo(level.goal.x - cameraX + 42, level.goal.y + 17);
  ctx.lineTo(level.goal.x - cameraX + 12, level.goal.y + 29);
  ctx.closePath();
  ctx.fill();
}

function drawGhost() {
  return;
}

function drawClone() {
  if (!activeClone) return;

  const sx = activeClone.x - cameraX;
  const sy = activeClone.y;

  ctx.save();
  ctx.globalAlpha = 0.5;
  if (playerSprite.complete && playerSprite.naturalWidth > 0) {
    if (activeClone.facing === -1) {
      ctx.translate(sx + player.w, sy);
      ctx.scale(-1, 1);
      ctx.drawImage(playerSprite, 0, 0, player.w, player.h);
    } else {
      ctx.drawImage(playerSprite, sx, sy, player.w, player.h);
    }
  } else {
    ctx.fillStyle = "#c77dff";
    ctx.fillRect(sx, sy, player.w, player.h);
  }
  ctx.restore();
}

function drawLaser() {
  if (performance.now() >= player.laserUntil) return;
  const startX = player.x - cameraX + player.w * 0.5;
  const y = player.y + player.h * 0.48;
  const dir = player.facing;
  const endX = startX + dir * LASER_RANGE;

  ctx.strokeStyle = "#ff4d6d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
}

function drawPlayer() {
  const blinking = performance.now() < player.invulnerableUntil && Math.floor(performance.now() / 100) % 2 === 0;
  if (blinking) return;

  const sx = player.x - cameraX;
  const sy = player.y;

  if (!playerSprite.complete || playerSprite.naturalWidth === 0) {
    ctx.fillStyle = "#e63946";
    ctx.fillRect(sx, sy, player.w, player.h);
    return;
  }

  ctx.save();
  if (player.facing === -1) {
    ctx.translate(sx + player.w, sy);
    ctx.scale(-1, 1);
    ctx.drawImage(playerSprite, 0, 0, player.w, player.h);
  } else {
    ctx.drawImage(playerSprite, sx, sy, player.w, player.h);
  }
  ctx.restore();

  if (performance.now() < player.dashUntil) {
    ctx.strokeStyle = "#ffffffcc";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 4, sy - 2, player.w + 8, player.h + 4);
  }
}

function drawWeatherOverlay() {
  if (weather.type === "rain") {
    ctx.strokeStyle = "#caf0f855";
    for (let i = 0; i < 70; i++) {
      const x = (i * 53 + performance.now() * 0.22) % canvas.width;
      const y = (i * 31 + performance.now() * 0.43) % canvas.height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 10);
      ctx.stroke();
    }
  }

  if (weather.type === "wind") {
    ctx.fillStyle = "#ffffff55";
    for (let i = 0; i < 11; i++) {
      const y = 60 + i * 36;
      const wave = Math.sin((performance.now() * 0.005) + i) * 18;
      ctx.fillRect(20 + wave, y, 130, 2);
    }
  }

  if (weather.type === "fog") {
    // White fog vignette disabled to keep the scene clean.
  }
}

function drawOverlay(text, color, subtext) {
  ctx.fillStyle = "#00000088";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = color;
  ctx.font = "bold 58px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 20);

  ctx.fillStyle = "#f1faee";
  ctx.font = "22px Trebuchet MS";
  ctx.fillText(subtext, canvas.width / 2, canvas.height / 2 + 24);

  if (bestTime !== null) {
    ctx.fillStyle = "#ffe066";
    ctx.fillText(`Best ghost time: ${bestTime.toFixed(1)}s`, canvas.width / 2, canvas.height / 2 + 58);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawCoins();
  drawCoinDrops();
  drawPowerUps();
  drawProjectiles();
  drawEnemies();
  drawBoss();
  drawGoal();
  drawGhost();
  drawClone();
  drawPlayer();
  drawLaser();
  drawParticles();
  drawWeatherOverlay();

  if (performance.now() < player.graviUntil) {
    ctx.fillStyle = "#9bf6ff2b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = "#1d3557";
  ctx.font = "bold 13px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText(`Combo: x${Math.max(1, Math.min(8, Math.pow(2, Math.max(0, stompCombo - 1))))}`, 16, 20);

  const dashSec = Math.max(0, (player.dashReadyAt - performance.now()) / 1000);
  ctx.fillText(`Dash: ${dashSec <= 0 ? "ready" : dashSec.toFixed(1) + "s"}`, 16, 36);
  ctx.fillText("Throw: F", 16, 52);
  const slowSec = Math.max(0, (player.slowReadyAt - performance.now()) / 1000);
  const graviSec = Math.max(0, (player.graviReadyAt - performance.now()) / 1000);
  const megaSec = Math.max(0, (player.megaJumpReadyAt - performance.now()) / 1000);
  const cloneSec = Math.max(0, (player.cloneReadyAt - performance.now()) / 1000);
  const laserSec = Math.max(0, (player.laserReadyAt - performance.now()) / 1000);
  ctx.fillText(`Slow(Q): ${slowSec <= 0 ? "ready" : slowSec.toFixed(1) + "s"}`, 16, 68);
  ctx.fillText(`Gravi(R): ${performance.now() < player.graviUntil ? "active" : graviSec <= 0 ? "ready" : graviSec.toFixed(1) + "s"}`, 16, 84);
  ctx.fillText(`Mega(E): ${megaSec <= 0 ? "ready" : megaSec.toFixed(1) + "s"}`, 16, 100);
  ctx.fillText(`Clone(T): ${activeClone ? "active" : cloneSec <= 0 ? "ready" : cloneSec.toFixed(1) + "s"}`, 16, 116);
  ctx.fillText(`Laser(Z): ${laserSec <= 0 ? "ready" : laserSec.toFixed(1) + "s"}`, 16, 132);

  if (won) {
    drawOverlay("Victory!", "#80ed99", "All 10 mechanics are active. Press Restart.");
  }

  if (gameOver) {
    drawOverlay("Game Over", "#ff6b6b", "Try again using checkpoints and power-ups.");
  }
}

function tick() {
  const now = performance.now();

  if (!gameOver && !won) {
    handleInput(now);
    applyPhysics(now);
    updateCheckpoints();
    updateEnemies(now);
    updateProjectiles(now);
    updateCoinDrops();
    updateParticles();
    updateClone(now);
    updateBoss(now);
    updateWeather(now);
    applyMagnetToCoins();
    collectCoins();
    collectPowerUps();
    checkGoal();
    updateCamera();

    runFrames.push({ x: player.x, y: player.y, facing: player.facing });
    if (runFrames.length > 20000) {
      runFrames.shift();
    }
  }

  render();
  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = true;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = true;
  }
  if (event.code === "ArrowDown" || event.code === "KeyS") {
    keys.down = true;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    keys.dash = true;
  }
  if (event.code === "KeyF") {
    keys.throwStone = true;
  }
  if (event.code === "KeyQ") {
    keys.slowTime = true;
  }
  if (event.code === "KeyE") {
    keys.megaJump = true;
  }
  if (event.code === "KeyR") {
    keys.graviShift = true;
  }
  if (event.code === "KeyT") {
    keys.cloneCast = true;
  }
  if (event.code === "KeyZ") {
    keys.laser = true;
  }
  if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
    keys.jump = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    keys.left = false;
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    keys.right = false;
  }
  if (event.code === "ArrowDown" || event.code === "KeyS") {
    keys.down = false;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    keys.dash = false;
  }
  if (event.code === "KeyF") {
    keys.throwStone = false;
  }
  if (event.code === "KeyQ") {
    keys.slowTime = false;
  }
  if (event.code === "KeyE") {
    keys.megaJump = false;
  }
  if (event.code === "KeyR") {
    keys.graviShift = false;
  }
  if (event.code === "KeyT") {
    keys.cloneCast = false;
  }
  if (event.code === "KeyZ") {
    keys.laser = false;
  }
  if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") {
    keys.jump = false;
  }
});

window.addEventListener("blur", () => {
  keys.left = false;
  keys.right = false;
  keys.jump = false;
  keys.down = false;
  keys.dash = false;
  keys.throwStone = false;
  keys.slowTime = false;
  keys.megaJump = false;
  keys.graviShift = false;
  keys.cloneCast = false;
  keys.laser = false;
});

window.addEventListener("resize", fitCanvasToStage);
window.addEventListener("load", fitCanvasToStage);

restartBtn.addEventListener("click", resetWorld);

fitCanvasToStage();
resetWorld();
tick();
