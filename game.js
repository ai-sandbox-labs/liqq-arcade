const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const speedEl = document.getElementById("speed");
const startBtn = document.getElementById("start-btn");
const tiltBtn = document.getElementById("tilt-btn");
const messageEl = document.getElementById("message");

let width = 0;
let height = 0;
let dpr = 1;
let backgroundGradient = null;

const laneCount = 3;
const baseSpeed = 420;
const maxMultiplier = 2.45;
const minGap = 160;
const baseMinSpawnTime = 0.34;
const slowMoScale = 0.85;
const speedPhaseEarly = 20;
const speedPhaseMid = 60;
const speedPhaseLate = 30;
const earlyMultiplier = 1.45;
const midMultiplier = 1.85;
const bestKey = "seekerRunnerBest";

const road = {
  left: 0,
  width: 0,
  laneWidth: 0,
};

const player = {
  lane: 1,
  x: 0,
  y: 0,
  width: 60,
  height: 90,
  color: "#f94144",
};

const obstacleTypes = [
  { color: "#f3722c", w: 0.66, h: 0.9 },
  { color: "#577590", w: 0.6, h: 1.02 },
  { color: "#4d908e", w: 0.56, h: 0.72 },
];

const patterns = [
  {
    name: "zigzag",
    rows: [
      { lanes: [0], gap: 230 },
      { lanes: [2], gap: 230 },
      { lanes: [0], gap: 230 },
      { lanes: [2], gap: 230 },
    ],
  },
  {
    name: "gates",
    rows: [
      { lanes: [0, 2], gap: 260 },
      { lanes: [0], gap: 210 },
      { lanes: [2], gap: 210 },
    ],
  },
  {
    name: "squeeze",
    rows: [
      { lanes: [0, 1], gap: 240 },
      { lanes: [1, 2], gap: 240 },
    ],
  },
  {
    name: "pulse",
    rows: [
      { lanes: [1], gap: 220 },
      { lanes: [0, 2], gap: 260 },
      { lanes: [1], gap: 220 },
    ],
  },
  {
    name: "switchback",
    rows: [
      { lanes: [2], gap: 220 },
      { lanes: [0], gap: 220 },
      { lanes: [2], gap: 220 },
      { lanes: [1], gap: 220 },
    ],
  },
  {
    name: "steps",
    rows: [
      { lanes: [0], gap: 205 },
      { lanes: [0, 1], gap: 210 },
      { lanes: [1], gap: 210 },
      { lanes: [1, 2], gap: 210 },
      { lanes: [2], gap: 210 },
    ],
  },
  {
    name: "center-line",
    rows: [
      { lanes: [1], gap: 200 },
      { lanes: [1], gap: 200 },
      { lanes: [0, 2], gap: 260 },
    ],
  },
  {
    name: "quick-swap",
    rows: [
      { lanes: [0, 2], gap: 230 },
      { lanes: [1], gap: 190 },
      { lanes: [0, 2], gap: 230 },
    ],
  },
  {
    name: "tunnel-left",
    repeat: [4, 6],
    rows: [{ lanes: [1, 2], gap: 210 }],
  },
  {
    name: "tunnel-center",
    repeat: [4, 6],
    rows: [{ lanes: [0, 2], gap: 210 }],
  },
  {
    name: "tunnel-right",
    repeat: [4, 6],
    rows: [{ lanes: [0, 1], gap: 210 }],
  },
  {
    name: "staggered-wall",
    rows: [
      { lanes: [0, 1], gap: 220 },
      { lanes: [1, 2], gap: 220 },
      { lanes: [0, 1], gap: 220 },
    ],
  },
];

let gameState = "idle";
let lastTime = 0;
let elapsedMs = 0;
let distance = 0;
let speed = baseSpeed;
let obstacles = [];
let patternQueue = [];
let spawnDistance = 0;
let patternDeck = [];
let lastPatternIndex = -1;
let tiltEnabled = false;
let tiltValue = 0;
let tiltTarget = 0;
let tiltBaseline = null;
let bestScore = 0;
let loopActive = false;
let dragActive = false;
let dragX = 0;
let activePointerId = null;
let slowMoTime = 0;
let shakeTime = 0;
let shakeDuration = 0;
let shakeStrength = 0;
let juiceCooldown = 0;

const audioState = {
  ctx: null,
  master: null,
  whooshGain: null,
  whooshFilter: null,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(current, target, rate) {
  return current + (target - current) * rate;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t) {
  if (t < 0.5) {
    return 2 * t * t;
  }
  return 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeInCubic(t) {
  return t * t * t;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getSpeedMultiplier(seconds) {
  if (seconds <= speedPhaseEarly) {
    const t = seconds / speedPhaseEarly;
    return lerp(1, earlyMultiplier, easeOutCubic(t));
  }
  if (seconds <= speedPhaseMid) {
    const t = (seconds - speedPhaseEarly) / (speedPhaseMid - speedPhaseEarly);
    return lerp(earlyMultiplier, midMultiplier, easeInOutQuad(t));
  }
  const lateElapsed = seconds - speedPhaseMid;
  const t = clamp(lateElapsed / speedPhaseLate, 0, 1);
  return lerp(midMultiplier, maxMultiplier, easeInCubic(t));
}

function decayEffects(deltaMs) {
  if (slowMoTime > 0) {
    slowMoTime = Math.max(0, slowMoTime - deltaMs);
  }
  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - deltaMs);
  }
  if (juiceCooldown > 0) {
    juiceCooldown = Math.max(0, juiceCooldown - deltaMs);
  }
}

function triggerShake(amount, duration) {
  if (amount > shakeStrength || shakeTime <= 0) {
    shakeStrength = amount;
  }
  shakeDuration = Math.max(shakeDuration, duration);
  shakeTime = Math.max(shakeTime, duration);
}

function triggerSlowMo(duration) {
  slowMoTime = Math.max(slowMoTime, duration);
}

function triggerNearMiss() {
  if (juiceCooldown > 0) return;
  triggerShake(1.6, 60);
  triggerSlowMo(80);
  juiceCooldown = 120;
}

function triggerSqueeze() {
  if (juiceCooldown > 0) return;
  triggerShake(2, 80);
  triggerSlowMo(90);
  juiceCooldown = 140;
}

function initAudio() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;
  if (audioState.ctx) {
    if (audioState.ctx.state === "suspended") {
      audioState.ctx.resume();
    }
    return;
  }

  const ctx = new AudioContextCtor();
  const master = ctx.createGain();
  master.gain.value = 0.25;
  master.connect(ctx.destination);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const whooshSource = ctx.createBufferSource();
  whooshSource.buffer = noiseBuffer;
  whooshSource.loop = true;

  const whooshFilter = ctx.createBiquadFilter();
  whooshFilter.type = "bandpass";
  whooshFilter.frequency.value = 360;
  whooshFilter.Q.value = 0.7;

  const whooshGain = ctx.createGain();
  whooshGain.gain.value = 0.0;

  whooshSource.connect(whooshFilter);
  whooshFilter.connect(whooshGain);
  whooshGain.connect(master);
  whooshSource.start();

  audioState.ctx = ctx;
  audioState.master = master;
  audioState.whooshGain = whooshGain;
  audioState.whooshFilter = whooshFilter;
}

function updateAudio(multiplier, running) {
  if (!audioState.ctx) return;
  const ctx = audioState.ctx;
  const targetGain = running ? 0.015 + multiplier * 0.02 : 0;
  const targetFreq = 260 + multiplier * 420;
  audioState.whooshGain.gain.setTargetAtTime(
    targetGain,
    ctx.currentTime,
    0.12
  );
  audioState.whooshFilter.frequency.setTargetAtTime(
    targetFreq,
    ctx.currentTime,
    0.15
  );
}

function playCrashPop() {
  if (!audioState.ctx) return;
  const ctx = audioState.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
  osc.connect(gain).connect(audioState.master);
  osc.start();
  osc.stop(ctx.currentTime + 0.22);
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  road.width = Math.min(width * 0.86, 620);
  road.left = (width - road.width) / 2;
  road.laneWidth = road.width / laneCount;

  const size = road.laneWidth * 0.5;
  player.width = size;
  player.height = size;
  player.y = height - player.height - Math.max(64, height * 0.12);
  player.x = road.left + road.laneWidth * (player.lane + 0.5) - player.width / 2;

  backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#14162d");
  backgroundGradient.addColorStop(0.55, "#0b0d1d");
  backgroundGradient.addColorStop(1, "#05060d");
}

function resetGame() {
  elapsedMs = 0;
  distance = 0;
  speed = baseSpeed;
  obstacles = [];
  patternQueue = [];
  patternDeck = [];
  spawnDistance = 420;
  lastPatternIndex = -1;
  player.lane = 1;
  tiltValue = 0;
  tiltTarget = 0;
  tiltBaseline = null;
  dragActive = false;
  activePointerId = null;
  slowMoTime = 0;
  shakeTime = 0;
  shakeDuration = 0;
  shakeStrength = 0;
  juiceCooldown = 0;
  messageEl.textContent = "Tap anywhere to start. Drag or tilt to dodge.";
  updateHud();
}

function updateHud() {
  const score = Math.floor(distance / 10);
  scoreEl.textContent = score.toString();
  const runBest = Math.max(bestScore, score);
  bestEl.textContent = runBest.toString();
  speedEl.textContent = `${(speed / baseSpeed).toFixed(2)}x`;
}

function startGame() {
  if (gameState === "running") return;
  resetGame();
  initAudio();
  gameState = "running";
  startBtn.textContent = "Restart";
  messageEl.textContent = "Go! Drag or tilt to stay alive.";
  lastTime = performance.now();
  if (!loopActive) {
    loopActive = true;
    requestAnimationFrame(loop);
  }
}


function endGame() {
  if (gameState !== "running") return;
  gameState = "crashed";
  triggerShake(2.4, 90);
  playCrashPop();
  const score = Math.floor(distance / 10);
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestKey, bestScore.toString());
  }
  updateHud();
  messageEl.textContent = "Crashed! Tap anywhere to run again.";
}

function refillPatternDeck() {
  patternDeck = patterns.map((_, index) => index);
  shuffle(patternDeck);
  if (patternDeck.length > 1 && patternDeck[0] === lastPatternIndex) {
    [patternDeck[0], patternDeck[1]] = [patternDeck[1], patternDeck[0]];
  }
}

function buildPatternRows(pattern) {
  const repeat = pattern.repeat
    ? Math.floor(
        pattern.repeat[0] +
          Math.random() * (pattern.repeat[1] - pattern.repeat[0] + 1)
      )
    : 1;
  const rows = [];
  for (let i = 0; i < repeat; i += 1) {
    pattern.rows.forEach((row) => {
      rows.push({ ...row });
    });
  }
  return rows;
}

function pickPattern() {
  if (patternDeck.length === 0) {
    refillPatternDeck();
  }
  const index = patternDeck.shift();
  lastPatternIndex = index;
  return patterns[index];
}

function spawnRow(row) {
  const openLaneCount = laneCount - row.lanes.length;
  let rowToken = null;
  if (openLaneCount === 1) {
    const openLane = Array.from({ length: laneCount }, (_, index) => index).find(
      (lane) => !row.lanes.includes(lane)
    );
    rowToken = { openLane, triggered: false };
  }

  row.lanes.forEach((lane) => {
    const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    const size = road.laneWidth * type.h;
    obstacles.push({
      lane,
      y: -size - 40,
      type,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.8 + Math.random() * 0.6,
      rowToken,
      nearMissed: false,
    });
  });
}

function updateObstacles(dt) {
  obstacles.forEach((obs) => {
    obs.y += speed * dt;
    obs.wobble += dt * obs.wobbleSpeed;
  });

  obstacles = obstacles.filter((obs) => obs.y < height + 240);
}

function getObstacleRect(obs) {
  const width = road.laneWidth * obs.type.w;
  const height = road.laneWidth * obs.type.h;
  const laneCenter = road.left + road.laneWidth * (obs.lane + 0.5);
  const wobbleOffset = Math.sin(obs.wobble) * road.laneWidth * 0.02;
  const x = laneCenter - width / 2 + wobbleOffset;
  return { x, y: obs.y, width, height };
}

function updatePlayer(dt) {
  tiltValue = lerp(tiltValue, tiltTarget, clamp(dt * 6, 0, 1));
  const laneCenter = road.left + road.laneWidth * (player.lane + 0.5);
  const tiltOffset = tiltEnabled ? tiltValue * road.laneWidth * 0.5 : 0;
  const dragTargetX = dragX - player.width / 2;
  const targetX = dragActive ? dragTargetX : laneCenter - player.width / 2 + tiltOffset;
  const minX = road.left + 6;
  const maxX = road.left + road.width - player.width - 6;
  const clamped = clamp(targetX, minX, maxX);
  player.x = lerp(player.x, clamped, clamp(dt * 10, 0, 1));
}

function update(deltaMs) {
  const timeScale = slowMoTime > 0 ? slowMoScale : 1;
  decayEffects(deltaMs);
  const scaledDelta = deltaMs * timeScale;
  elapsedMs += scaledDelta;
  const seconds = elapsedMs / 1000;
  const multiplier = getSpeedMultiplier(seconds);
  speed = baseSpeed * multiplier;
  const dt = scaledDelta / 1000;
  distance += speed * dt;
  spawnDistance -= speed * dt;

  updatePlayer(dt);
  updateObstacles(dt);

  while (spawnDistance <= 0) {
    if (patternQueue.length === 0) {
      const pattern = pickPattern();
      patternQueue = buildPatternRows(pattern);
    }
    const row = patternQueue.shift();
    spawnRow(row);
    const gapScale = clamp(1 - (multiplier - 1) * 0.12, 0.7, 1);
    const openLaneCount = laneCount - row.lanes.length;
    const densityBoost = openLaneCount === 1 ? 1.2 : 1;
    const spacingBoost = 1 + (multiplier - 1) * 0.08;
    const gapTarget = row.gap * gapScale * densityBoost * spacingBoost;
    const minSpawnTime = baseMinSpawnTime + (multiplier - 1) * 0.05;
    const minDistanceByTime = speed * minSpawnTime;
    spawnDistance += Math.max(minGap, gapTarget, minDistanceByTime);
  }

  const hitbox = {
    x: player.x + player.width * 0.22,
    y: player.y + player.height * 0.2,
    width: player.width * 0.56,
    height: player.height * 0.6,
  };

  for (const obs of obstacles) {
    const rect = getObstacleRect(obs);
    const obstacleHitbox = {
      x: rect.x + rect.width * 0.08,
      y: rect.y + rect.height * 0.08,
      width: rect.width * 0.84,
      height: rect.height * 0.84,
    };
    const verticalOverlap =
      obstacleHitbox.y < hitbox.y + hitbox.height &&
      obstacleHitbox.y + obstacleHitbox.height > hitbox.y;
    if (obs.rowToken && !obs.rowToken.triggered && verticalOverlap) {
      if (player.lane === obs.rowToken.openLane) {
        triggerSqueeze();
        obs.rowToken.triggered = true;
      }
    }
    if (!obs.nearMissed && verticalOverlap) {
      const gapLeft = hitbox.x - (obstacleHitbox.x + obstacleHitbox.width);
      const gapRight = obstacleHitbox.x - (hitbox.x + hitbox.width);
      const horizontalGap = Math.max(gapLeft, gapRight);
      const nearMargin = road.laneWidth * 0.08;
      if (horizontalGap > 0 && horizontalGap < nearMargin) {
        triggerNearMiss();
        obs.nearMissed = true;
      }
    }
    if (
      obstacleHitbox.x < hitbox.x + hitbox.width &&
      obstacleHitbox.x + obstacleHitbox.width > hitbox.x &&
      obstacleHitbox.y < hitbox.y + hitbox.height &&
      obstacleHitbox.y + obstacleHitbox.height > hitbox.y
    ) {
      endGame();
      break;
    }
  }

  updateHud();
}

function drawBackground() {
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0b0f1f";
  ctx.fillRect(road.left, 0, road.width, height);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(road.left, 0, 3, height);
  ctx.fillRect(road.left + road.width - 3, 0, 3, height);

  const segment = Math.max(32, road.laneWidth * 0.45);
  const gap = segment * 0.65;
  const travel = (distance * 0.8) % (segment + gap);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 1; i < laneCount; i += 1) {
    const x = road.left + road.laneWidth * i;
    for (let y = -segment - travel; y < height + segment; y += segment + gap) {
      ctx.fillRect(x - 2, y, 4, segment);
    }
  }
}

function drawObstacles() {
  obstacles.forEach((obs) => {
    const rect = getObstacleRect(obs);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(rect.x + 6, rect.y + 8, rect.width, rect.height);
    ctx.fillStyle = obs.type.color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(rect.x, rect.y, rect.width, Math.max(6, rect.height * 0.12));
  });
}

function drawPlayer() {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(player.x + 6, player.y + 10, player.width, player.height);
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(
    player.x,
    player.y,
    player.width,
    Math.max(8, player.height * 0.15)
  );
}

function applyCameraShake() {
  if (shakeTime <= 0 || shakeDuration <= 0) return;
  const intensity = shakeStrength * (shakeTime / shakeDuration);
  const offsetX = (Math.random() * 2 - 1) * intensity;
  const offsetY = (Math.random() * 2 - 1) * intensity;
  ctx.translate(offsetX, offsetY);
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  applyCameraShake();
  drawBackground();
  drawObstacles();
  drawPlayer();
  ctx.restore();
}

function loop(time) {
  const deltaMs = Math.min(50, time - lastTime);
  lastTime = time;
  if (gameState === "running") {
    update(deltaMs);
  } else {
    decayEffects(deltaMs);
  }
  updateAudio(gameState === "running" ? speed / baseSpeed : 0, gameState === "running");
  draw();
  requestAnimationFrame(loop);
}

function handleStartFromGesture() {
  if (gameState !== "running") {
    startGame();
  }
}

function shouldIgnoreGlobalStartTarget(target) {
  if (!target) return false;
  if (target === startBtn || target === tiltBtn) return false;
  // Don't steal focus from any buttons/inputs/links.
  return Boolean(target.closest && target.closest("button, a, input, textarea, select"));
}

function handleGlobalStart(event) {
  if (gameState === "running") return;
  if (shouldIgnoreGlobalStartTarget(event?.target)) return;
  startGame();
}

function setDragPosition(clientX) {
  const minX = road.left + player.width / 2;
  const maxX = road.left + road.width - player.width / 2;
  dragX = clamp(clientX, minX, maxX);
}

function beginDrag(clientX, pointerId = null) {
  dragActive = true;
  activePointerId = pointerId;
  setDragPosition(clientX);
}

function moveDrag(clientX) {
  if (!dragActive) return;
  setDragPosition(clientX);
}

function endDrag(pointerId = null) {
  if (pointerId !== null && activePointerId !== null && pointerId !== activePointerId) {
    return;
  }
  dragActive = false;
  activePointerId = null;
}

const supportsPointer = "PointerEvent" in window;
if (supportsPointer) {
  canvas.addEventListener("pointerdown", (event) => {
    if (activePointerId !== null) return;
    if (canvas.setPointerCapture) {
      canvas.setPointerCapture(event.pointerId);
    }
    beginDrag(event.clientX, event.pointerId);
    handleStartFromGesture();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;
    moveDrag(event.clientX);
  });

  const endHandler = (event) => {
    endDrag(event.pointerId);
  };
  canvas.addEventListener("pointerup", endHandler);
  canvas.addEventListener("pointercancel", endHandler);
  canvas.addEventListener("lostpointercapture", endHandler);
  canvas.addEventListener("pointerleave", endHandler);
} else {
  canvas.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 0) return;
      const touch = event.touches[0];
      beginDrag(touch.clientX, touch.identifier);
      handleStartFromGesture();
      event.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (event) => {
      if (!dragActive) return;
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === activePointerId
      );
      if (touch) {
        moveDrag(touch.clientX);
        event.preventDefault();
      }
    },
    { passive: false }
  );

  const touchEndHandler = (event) => {
    const ended = Array.from(event.changedTouches).find(
      (item) => item.identifier === activePointerId
    );
    if (ended) {
      endDrag(ended.identifier);
    }
  };
  canvas.addEventListener("touchend", touchEndHandler);
  canvas.addEventListener("touchcancel", touchEndHandler);
}

function syncLaneFromPosition() {
  const lane = Math.round((player.x + player.width / 2 - road.left) / road.laneWidth - 0.5);
  player.lane = clamp(lane, 0, laneCount - 1);
}

function clearDrag() {
  dragActive = false;
  activePointerId = null;
}

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    clearDrag();
    player.lane = Math.max(0, player.lane - 1);
  } else if (event.key === "ArrowRight") {
    clearDrag();
    player.lane = Math.min(laneCount - 1, player.lane + 1);
  } else if (event.key === " " || event.key === "Enter") {
    handleStartFromGesture();
  }
});

startBtn.addEventListener("click", () => {
  startGame();
});

// Tap anywhere (including UI overlay) to start/restart when not running.
document.addEventListener("pointerdown", handleGlobalStart, { passive: true });
document.addEventListener(
  "touchstart",
  (event) => {
    // Fallback for older browsers without pointer events.
    if (!("PointerEvent" in window)) {
      handleGlobalStart(event);
    }
  },
  { passive: true }
);

function enableTiltSupport() {
  tiltEnabled = true;
  tiltBaseline = null;
  tiltBtn.classList.add("hidden");
  messageEl.textContent = "Tilt active! Drag to fine-tune.";
}

if (typeof DeviceOrientationEvent !== "undefined") {
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    tiltBtn.classList.remove("hidden");
    tiltBtn.addEventListener("click", async () => {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === "granted") {
          enableTiltSupport();
        } else {
          messageEl.textContent = "Tilt permission denied. Drag controls only.";
        }
      } catch (error) {
        messageEl.textContent = "Tilt unavailable. Drag controls only.";
      }
    });
  } else {
    enableTiltSupport();
  }

  window.addEventListener("deviceorientation", (event) => {
    if (!tiltEnabled) return;
    const gamma = event.gamma ?? 0;
    if (tiltBaseline === null) {
      tiltBaseline = gamma;
    }
    const adjusted = gamma - tiltBaseline;
    tiltTarget = clamp(adjusted / 28, -1, 1);
  });
}

window.addEventListener("resize", () => {
  resize();
  if (dragActive) {
    setDragPosition(dragX);
  } else {
    syncLaneFromPosition();
  }
  draw();
});

bestScore = Number(localStorage.getItem(bestKey)) || 0;
bestEl.textContent = bestScore.toString();
resize();
draw();
