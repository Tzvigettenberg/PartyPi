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

const board = {
  x: 170,
  y: 80,
  w: 940,
  h: 560
};

const marble = {
  x: board.x + 80,
  y: board.y + 80,
  r: 18,
  vx: 0,
  vy: 0
};

const goal = {
  x: board.x + board.w - 80,
  y: board.y + board.h - 80,
  r: 24
};

let won = false;
let particles = [];

// Simpler, guaranteed-solvable layout.
// Intended main route:
// start -> right across top -> down right side -> left middle -> down near left -> right to goal
const walls = [
  { x: board.x + 180, y: board.y + 120, w: 28, h: 330 },
  { x: board.x + 420, y: board.y + 40,  w: 28, h: 250 },
  { x: board.x + 660, y: board.y + 200, w: 28, h: 300 },

  { x: board.x + 180, y: board.y + 120, w: 220, h: 28 },
  { x: board.x + 420, y: board.y + 260, w: 220, h: 28 },
  { x: board.x + 180, y: board.y + 420, w: 300, h: 28 },
  { x: board.x + 660, y: board.y + 500, w: 180, h: 28 }
];

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
  for (let i = 0; i < 18; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 22 + Math.random() * 16,
      size: 3 + Math.random() * 4,
      color
    });
  }
}

function resetMarble() {
  marble.x = board.x + 80;
  marble.y = board.y + 80;
  marble.vx = 0;
  marble.vy = 0;
  won = false;
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= 1;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function circleRectCollision(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

function resolveWallCollisions() {
  for (const wall of walls) {
    if (!circleRectCollision(marble, wall)) continue;

    const closestX = clamp(marble.x, wall.x, wall.x + wall.w);
    const closestY = clamp(marble.y, wall.y, wall.y + wall.h);
    const dx = marble.x - closestX;
    const dy = marble.y - closestY;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        marble.x = wall.x + wall.w + marble.r;
      } else {
        marble.x = wall.x - marble.r;
      }
      marble.vx *= -0.35;
    } else {
      if (dy > 0) {
        marble.y = wall.y + wall.h + marble.r;
      } else {
        marble.y = wall.y - marble.r;
      }
      marble.vy *= -0.35;
    }
  }
}

function updateGame() {
  const tiltX = clamp(input.centeredGamma, -40, 40);
  const tiltY = clamp(input.centeredBeta, -40, 40);

  let ax = 0;
  let ay = 0;
  const deadzone = 2.2;

  if (Math.abs(tiltX) > deadzone) ax = tiltX * 0.03;
  if (Math.abs(tiltY) > deadzone) ay = tiltY * 0.03;

  marble.vx += ax;
  marble.vy += ay;

  marble.vx *= 0.985;
  marble.vy *= 0.985;

  marble.x += marble.vx;
  marble.y += marble.vy;

  if (marble.x - marble.r < board.x) {
    marble.x = board.x + marble.r;
    marble.vx *= -0.35;
  }
  if (marble.x + marble.r > board.x + board.w) {
    marble.x = board.x + board.w - marble.r;
    marble.vx *= -0.35;
  }
  if (marble.y - marble.r < board.y) {
    marble.y = board.y + marble.r;
    marble.vy *= -0.35;
  }
  if (marble.y + marble.r > board.y + board.h) {
    marble.y = board.y + board.h - marble.r;
    marble.vy *= -0.35;
  }

  resolveWallCollisions();

  const dx = marble.x - goal.x;
  const dy = marble.y - goal.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (!won && dist < goal.r) {
    won = true;
    spawnParticles(goal.x, goal.y, "#22c55e");
  }

  updateParticles();
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

function drawBoard() {
  ctx.fillStyle = "#1f2937";
  roundRect(board.x, board.y, board.w, board.h, 28);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 4;
  roundRect(board.x, board.y, board.w, board.h, 28);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  roundRect(board.x + 16, board.y + 16, board.w - 32, board.h - 32, 20);
  ctx.fill();
}

function drawWalls() {
  for (const wall of walls) {
    const grad = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
    grad.addColorStop(0, "#475569");
    grad.addColorStop(1, "#334155");
    ctx.fillStyle = grad;
    roundRect(wall.x, wall.y, wall.w, wall.h, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    roundRect(wall.x, wall.y, wall.w, wall.h, 12);
    ctx.stroke();
  }
}

function drawGoal() {
  const glow = ctx.createRadialGradient(goal.x, goal.y, 8, goal.x, goal.y, 54);
  glow.addColorStop(0, "rgba(34,197,94,0.55)");
  glow.addColorStop(1, "rgba(34,197,94,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(goal.x, goal.y, 54, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(goal.x - 7, goal.y - 8, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrail() {
  const trail = [];
  for (let i = 0; i < 8; i++) {
    trail.push({
      x: marble.x - marble.vx * i * 1.4,
      y: marble.y - marble.vy * i * 1.4,
      a: 0.18 - i * 0.02
    });
  }

  for (const t of trail) {
    ctx.globalAlpha = Math.max(0, t.a);
    ctx.fillStyle = "#93c5fd";
    ctx.beginPath();
    ctx.arc(t.x, t.y, marble.r * 0.78, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMarble() {
  drawTrail();

  const glow = ctx.createRadialGradient(marble.x, marble.y, 8, marble.x, marble.y, 52);
  glow.addColorStop(0, "rgba(147,197,253,0.55)");
  glow.addColorStop(1, "rgba(147,197,253,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(marble.x, marble.y, 52, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(marble.x - 8, marble.y - 10, 6, marble.x, marble.y, marble.r + 8);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.25, "#bfdbfe");
  grad.addColorStop(0.7, "#60a5fa");
  grad.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(marble.x, marble.y, marble.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(marble.x - 6, marble.y - 8, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 32);
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
  ctx.fillText("Marble Roll", 40, 62);

  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("Tilt to roll the marble through the maze.", 40, 98);

  const status = input.connected
    ? (input.motionEnabled ? "Motion active" : "Controller connected, motion not enabled")
    : "Waiting for controller";

  ctx.fillText(status, 40, 134);
  ctx.fillText(`Tilt X ${input.centeredGamma.toFixed(1)}`, 40, 170);
  ctx.fillText(`Tilt Y ${input.centeredBeta.toFixed(1)}`, 40, 206);

  if (won) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 42px Arial";
    ctx.fillText("GOAL!", canvas.width - 40, 66);

    ctx.font = "22px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText("Press Pause to leave, or refresh the game to retry", canvas.width - 40, 102);
    ctx.textAlign = "left";
  }
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

  if (!paused && !won) {
    updateGame();
  }

  drawBackground();
  drawBoard();
  drawWalls();
  drawGoal();
  drawMarble();
  drawParticles();
  drawHud();

  if (paused) {
    drawPauseOverlay();
  }

  requestAnimationFrame(loop);
}

resetMarble();
loop();
