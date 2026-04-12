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

let score = 0;
let pulse = 0;

const arena = {
  x: 100,
  y: 150,
  w: canvas.width - 200,
  h: canvas.height - 240
};

const ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 34,
  vx: 0,
  vy: 0
};

const target = {
  x: 0,
  y: 0,
  radius: 26
};

const particles = [];

spawnTarget();

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

function spawnTarget() {
  target.x = arena.x + 90 + Math.random() * (arena.w - 180);
  target.y = arena.y + 90 + Math.random() * (arena.h - 180);
}

function spawnHitParticles(x, y) {
  for (let i = 0; i < 16; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 18 + Math.random() * 14,
      size: 3 + Math.random() * 5
    });
  }
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

function update() {
  pulse += 0.05;

  const tiltX = clamp(input.centeredGamma, -45, 45);
  const tiltY = clamp(input.centeredBeta, -45, 45);
  const deadzone = 2.2;

  let pushX = 0;
  let pushY = 0;

  if (Math.abs(tiltX) > deadzone) {
    pushX = tiltX * 0.045;
  }

  if (Math.abs(tiltY) > deadzone) {
    pushY = tiltY * 0.045;
  }

  ball.vx += pushX;
  ball.vy += pushY;

  ball.vx *= 0.9;
  ball.vy *= 0.9;

  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.x - ball.radius < arena.x) {
    ball.x = arena.x + ball.radius;
    ball.vx *= -0.45;
  }

  if (ball.x + ball.radius > arena.x + arena.w) {
    ball.x = arena.x + arena.w - ball.radius;
    ball.vx *= -0.45;
  }

  if (ball.y - ball.radius < arena.y) {
    ball.y = arena.y + ball.radius;
    ball.vy *= -0.45;
  }

  if (ball.y + ball.radius > arena.y + arena.h) {
    ball.y = arena.y + arena.h - ball.radius;
    ball.vy *= -0.45;
  }

  const dx = ball.x - target.x;
  const dy = ball.y - target.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < ball.radius + target.radius) {
    score++;
    spawnHitParticles(target.x, target.y);
    spawnTarget();
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

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#081225");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawArena() {
  ctx.fillStyle = "#0f172a";
  roundRect(arena.x, arena.y, arena.w, arena.h, 40);
  ctx.fill();

  ctx.strokeStyle = "rgba(147,197,253,0.35)";
  ctx.lineWidth = 4;
  roundRect(arena.x, arena.y, arena.w, arena.h, 40);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, arena.y + 16);
  ctx.lineTo(canvas.width / 2, arena.y + arena.h - 16);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(arena.x + 16, canvas.height / 2);
  ctx.lineTo(arena.x + arena.w - 16, canvas.height / 2);
  ctx.stroke();
}

function drawTarget() {
  const glowRadius = target.radius + 18 + Math.sin(pulse * 2) * 4;

  const glow = ctx.createRadialGradient(target.x, target.y, 6, target.x, target.y, glowRadius);
  glow.addColorStop(0, "rgba(250,204,21,0.55)");
  glow.addColorStop(1, "rgba(250,204,21,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(target.x, target.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.arc(target.x - 7, target.y - 8, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall() {
  const glow = ctx.createRadialGradient(ball.x, ball.y, 8, ball.x, ball.y, 56);
  glow.addColorStop(0, "rgba(147,197,253,0.55)");
  glow.addColorStop(1, "rgba(147,197,253,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 56, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(ball.x - 10, ball.y - 12, 8, ball.x, ball.y, ball.radius + 8);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.25, "#bfdbfe");
  grad.addColorStop(0.7, "#60a5fa");
  grad.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(ball.x - 10, ball.y - 12, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 32);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = "white";
  ctx.font = "bold 52px Arial";
  ctx.fillText("Gyro Lab", 40, 64);

  ctx.font = "26px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("Tilt to move in all directions and hit the glowing target.", 40, 102);

  const status = input.connected
    ? (input.motionEnabled ? "Motion active" : "Controller connected, motion not enabled")
    : "Waiting for gyro controller";

  ctx.fillText(status, 40, 142);
  ctx.fillText(`Centered X: ${input.centeredGamma.toFixed(1)}`, 40, 182);
  ctx.fillText(`Centered Y: ${input.centeredBeta.toFixed(1)}`, 40, 222);

  ctx.textAlign = "right";
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 44px Arial";
  ctx.fillText(`Score ${score}`, canvas.width - 40, 66);

  ctx.font = "22px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("Use Start Motion, then Recenter", canvas.width - 40, 102);
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
    update();
  }

  drawBackground();
  drawArena();
  drawTarget();
  drawBall();
  drawParticles();
  drawHud();

  if (paused) {
    drawPauseOverlay();
  }

  requestAnimationFrame(loop);
}

loop();
