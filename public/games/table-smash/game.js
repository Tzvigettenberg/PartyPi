const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let input = {
  gamma: 0,
  beta: 0,
  centeredGamma: 0,
  centeredBeta: 0,
  connected: false,
  motionEnabled: false,
  pause: false,
  up: false,
  down: false,
  enter: false
};

let previousInput = {
  pause: false,
  up: false,
  down: false,
  enter: false
};

let paused = false;
let pauseIndex = 0;

const pauseOptions = [
  { label: "Resume", action: "resume" },
  { label: "Return Home", action: "home" }
];

const arena = {
  x: 100,
  y: 110,
  w: canvas.width - 200,
  h: canvas.height - 180
};

const paddle = {
  x: canvas.width / 2,
  y: canvas.height - 90,
  w: 180,
  h: 22
};

const ball = {
  x: canvas.width / 2,
  y: 180,
  r: 18,
  vx: 0,
  vy: 6.5,
  trail: []
};

let score = 0;
let combo = 0;
let lastResult = "WAITING";
let resultTimer = 0;
let particles = [];
let previousGamma = 0;
let previousBeta = 0;
let lastSwingTime = 0;
let swingCooldown = 220;

const ws = new WebSocket(`ws://${location.host}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "gyro") {
    input.gamma = typeof data.gamma === "number" ? data.gamma : 0;
    input.beta = typeof data.beta === "number" ? data.beta : 0;
    input.centeredGamma = typeof data.centeredGamma === "number" ? data.centeredGamma : 0;
    input.centeredBeta = typeof data.centeredBeta === "number" ? data.centeredBeta : 0;
    input.connected = true;
    input.motionEnabled = !!data.motionEnabled;
    return;
  }

  input.pause = !!data.pause;
  input.up = !!data.up;
  input.down = !!data.down;
  input.enter = !!data.enter;
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function spawnParticles(x, y, color = "#facc15") {
  for (let i = 0; i < 16; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 20 + Math.random() * 18,
      size: 3 + Math.random() * 4,
      color
    });
  }
}

function resetBall() {
  ball.x = arena.x + arena.w / 2 + (Math.random() - 0.5) * 220;
  ball.y = arena.y + 80;
  ball.vx = (Math.random() - 0.5) * 2.5;
  ball.vy = 5.8 + Math.random() * 1.6;
  ball.trail = [];
}

function registerResult(text, color) {
  lastResult = text;
  resultTimer = 50;
  if (text === "MISS") {
    combo = 0;
  }
  spawnParticles(ball.x, ball.y, color);
}

function detectSwing() {
  const now = Date.now();
  if (!input.motionEnabled) return null;
  if (now - lastSwingTime < swingCooldown) return null;

  const deltaGamma = input.gamma - previousGamma;
  const deltaBeta = input.beta - previousBeta;
  const speed = Math.sqrt(deltaGamma * deltaGamma + deltaBeta * deltaBeta);

  previousGamma = input.gamma;
  previousBeta = input.beta;

  if (speed < 7.5) return null;

  lastSwingTime = now;

  let strength = "good";
  if (speed >= 14) strength = "perfect";
  else if (speed < 10) strength = "weak";

  return {
    speed,
    strength
  };
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= 1;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function handlePaddleMovement() {
  const tilt = clamp(input.centeredGamma, -40, 40);
  const targetX = arena.x + arena.w / 2 + tilt * 12;
  paddle.x += (targetX - paddle.x) * 0.22;
  paddle.x = clamp(paddle.x, arena.x + paddle.w / 2, arena.x + arena.w - paddle.w / 2);
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x - ball.r < arena.x) {
    ball.x = arena.x + ball.r;
    ball.vx *= -1;
  }

  if (ball.x + ball.r > arena.x + arena.w) {
    ball.x = arena.x + arena.w - ball.r;
    ball.vx *= -1;
  }

  if (ball.y - ball.r < arena.y) {
    ball.y = arena.y + ball.r;
    ball.vy *= -1;
  }

  if (ball.y - ball.r > arena.y + arena.h + 40) {
    registerResult("MISS", "#ef4444");
    resetBall();
  }

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 8) {
    ball.trail.shift();
  }
}

function tryHitBall(swing) {
  const impactWindowTop = paddle.y - 42;
  const impactWindowBottom = paddle.y + 34;
  const inVerticalWindow = ball.y > impactWindowTop && ball.y < impactWindowBottom;
  const dx = ball.x - paddle.x;
  const inHorizontalWindow = Math.abs(dx) < paddle.w / 2 + ball.r;

  if (!inVerticalWindow || !inHorizontalWindow || ball.vy < 0) {
    registerResult("WHIFF", "#f97316");
    return;
  }

  const timingDistance = Math.abs(ball.y - paddle.y);
  let quality = "GOOD";
  let speedBoost = 1.0;

  if (timingDistance < 10 && swing.strength === "perfect") {
    quality = "PERFECT";
    speedBoost = 1.35;
    combo++;
    score += 3 + combo;
  } else if (timingDistance < 18) {
    quality = "GOOD";
    speedBoost = swing.strength === "weak" ? 0.95 : 1.12;
    combo++;
    score += 2 + Math.floor(combo / 2);
  } else {
    quality = "LATE";
    speedBoost = 0.88;
    combo = 0;
    score += 1;
  }

  const edgeFactor = dx / (paddle.w / 2);
  ball.vx = clamp(edgeFactor * 7 + input.centeredGamma * 0.03, -9, 9);
  ball.vy = -(7.2 + speedBoost * 2.6);

  registerResult(
    quality,
    quality === "PERFECT" ? "#22c55e" : quality === "GOOD" ? "#facc15" : "#fb923c"
  );
}

function handleGameplay() {
  handlePaddleMovement();
  updateBall();

  const swing = detectSwing();
  if (swing) {
    tryHitBall(swing);
  }

  updateParticles();

  if (resultTimer > 0) {
    resultTimer--;
  }
}

function handlePressedEvents() {
  const pausePressed = input.pause && !previousInput.pause;
  const upPressed = input.up && !previousInput.up;
  const downPressed = input.down && !previousInput.down;
  const enterPressed = input.enter && !previousInput.enter;

  if (pausePressed) {
    paused = !paused;
  }

  if (paused) {
    if (upPressed) {
      pauseIndex--;
      if (pauseIndex < 0) pauseIndex = pauseOptions.length - 1;
    }

    if (downPressed) {
      pauseIndex++;
      if (pauseIndex > pauseOptions.length - 1) pauseIndex = 0;
    }

    if (enterPressed) {
      const selected = pauseOptions[pauseIndex];

      if (selected.action === "resume") {
        paused = false;
      }

      if (selected.action === "home") {
        window.location.href = "/";
      }
    }
  }

  previousInput.pause = input.pause;
  previousInput.up = input.up;
  previousInput.down = input.down;
  previousInput.enter = input.enter;
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#081225");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawArena() {
  ctx.fillStyle = "#0f172a";
  roundRect(arena.x, arena.y, arena.w, arena.h, 32);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 4;
  roundRect(arena.x, arena.y, arena.w, arena.h, 32);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(arena.x, arena.y + arena.h / 2);
  ctx.lineTo(arena.x + arena.w, arena.y + arena.h / 2);
  ctx.stroke();
}

function drawTrail() {
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const alpha = (i + 1) / ball.trail.length * 0.25;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#93c5fd";
    ctx.beginPath();
    ctx.arc(t.x, t.y, ball.r * (0.5 + i / ball.trail.length * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBall() {
  const glow = ctx.createRadialGradient(ball.x, ball.y, 8, ball.x, ball.y, 48);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.beginPath();
  ctx.arc(ball.x - 5, ball.y - 5, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawPaddle() {
  ctx.save();
  ctx.translate(paddle.x, paddle.y);

  const grad = ctx.createLinearGradient(0, -paddle.h / 2, 0, paddle.h / 2);
  grad.addColorStop(0, "#f97316");
  grad.addColorStop(1, "#ea580c");
  ctx.fillStyle = grad;
  roundRect(-paddle.w / 2, -paddle.h / 2, paddle.w, paddle.h, 14);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  roundRect(-paddle.w / 2, -paddle.h / 2, paddle.w, 6, 12);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = "white";
  ctx.font = "bold 50px Arial";
  ctx.fillText("Table Smash", 40, 62);

  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("Tilt to move. Swing phone to return the ball.", 40, 98);

  const status = input.connected
    ? (input.motionEnabled ? "Motion active" : "Controller connected, motion not enabled")
    : "Waiting for controller";

  ctx.fillText(status, 40, 134);
  ctx.fillText(`Tilt X ${input.centeredGamma.toFixed(1)}`, 40, 170);

  ctx.textAlign = "right";
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 40px Arial";
  ctx.fillText(`Score ${score}`, canvas.width - 40, 60);
  ctx.fillText(`Combo ${combo}`, canvas.width - 40, 102);
  ctx.textAlign = "left";
}

function drawResult() {
  if (resultTimer <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, resultTimer / 18);
  ctx.textAlign = "center";
  ctx.font = "bold 58px Arial";

  let color = "#ffffff";
  if (lastResult === "PERFECT") color = "#22c55e";
  else if (lastResult === "GOOD") color = "#facc15";
  else if (lastResult === "LATE") color = "#fb923c";
  else color = "#ef4444";

  ctx.fillStyle = color;
  ctx.fillText(lastResult, canvas.width / 2, arena.y + 70);
  ctx.restore();

  ctx.textAlign = "left";
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelWidth = 520;
  const panelHeight = 300;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - panelHeight) / 2;

  ctx.fillStyle = "#111827";
  roundRect(panelX, panelY, panelWidth, panelHeight, 28);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  roundRect(panelX, panelY, panelWidth, panelHeight, 28);
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "bold 44px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Paused", canvas.width / 2, panelY + 62);

  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("Use up and down. Press Enter.", canvas.width / 2, panelY + 105);

  for (let i = 0; i < pauseOptions.length; i++) {
    const option = pauseOptions[i];
    const optionX = panelX + 50;
    const optionY = panelY + 135 + i * 68;
    const optionW = panelWidth - 100;
    const optionH = 50;

    ctx.fillStyle = i === pauseIndex ? "#2563eb" : "rgba(255,255,255,0.10)";
    roundRect(optionX, optionY, optionW, optionH, 16);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 26px Arial";
    ctx.fillText(option.label, canvas.width / 2, optionY + 33);
  }

  ctx.textAlign = "left";
}

function loop() {
  handlePressedEvents();

  if (!paused) {
    handleGameplay();
  }

  drawBackground();
  drawArena();
  drawTrail();
  drawBall();
  drawPaddle();
  drawParticles();
  drawHud();
  drawResult();

  if (paused) {
    drawPauseOverlay();
  }

  requestAnimationFrame(loop);
}

resetBall();
loop();
