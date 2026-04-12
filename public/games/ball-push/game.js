const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let input = {
  left: false,
  right: false,
  up: false,
  down: false,
  enter: false,
  pause: false
};

let previousInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  enter: false,
  pause: false
};

let paused = false;
let pauseIndex = 0;

const pauseOptions = [
  { label: "Resume", action: "resume" },
  { label: "Return Home", action: "home" }
];

const arena = {
  x: 70,
  y: 110,
  w: canvas.width - 140,
  h: canvas.height - 180
};

const ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 34,
  vx: 0,
  vy: 0,
  squashX: 1,
  squashY: 1,
  glow: 0
};

const pushForce = 0.34;
const drag = 0.992;
const bounce = 0.94;
const maxSpeed = 16;
const trail = [];

let flashTimer = 0;
let lastHitSide = "";

const particles = [];

const ws = new WebSocket(`ws://${location.host}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "gyro") {
    return;
  }

  input.left = !!data.left;
  input.right = !!data.right;
  input.up = !!data.up;
  input.down = !!data.down;
  input.enter = !!data.enter;
  input.pause = !!data.pause;
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

function spawnHitParticles(x, y) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      life: 18 + Math.random() * 12,
      size: 3 + Math.random() * 4
    });
  }
}

function hitWall(side) {
  flashTimer = 10;
  lastHitSide = side;
  ball.glow = 1;

  if (side === "left") spawnHitParticles(arena.x, ball.y);
  if (side === "right") spawnHitParticles(arena.x + arena.w, ball.y);
  if (side === "top") spawnHitParticles(ball.x, arena.y);
  if (side === "bottom") spawnHitParticles(ball.x, arena.y + arena.h);

  if (side === "left" || side === "right") {
    ball.squashX = 1.28;
    ball.squashY = 0.78;
  } else {
    ball.squashX = 0.78;
    ball.squashY = 1.28;
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

function updateTrail() {
  trail.push({
    x: ball.x,
    y: ball.y,
    sx: ball.squashX,
    sy: ball.squashY,
    a: 0.22 + Math.min(0.22, Math.abs(ball.vx) * 0.01 + Math.abs(ball.vy) * 0.01)
  });

  if (trail.length > 10) {
    trail.shift();
  }
}

function updateGame() {
  if (input.left) ball.vx -= pushForce;
  if (input.right) ball.vx += pushForce;
  if (input.up) ball.vy -= pushForce;
  if (input.down) ball.vy += pushForce;

  ball.vx = clamp(ball.vx, -maxSpeed, maxSpeed);
  ball.vy = clamp(ball.vy, -maxSpeed, maxSpeed);

  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.vx *= drag;
  ball.vy *= drag;

  if (Math.abs(ball.vx) < 0.02) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.02) ball.vy = 0;

  if (ball.x - ball.radius < arena.x) {
    ball.x = arena.x + ball.radius;
    ball.vx = Math.abs(ball.vx) * bounce;
    hitWall("left");
  }

  if (ball.x + ball.radius > arena.x + arena.w) {
    ball.x = arena.x + arena.w - ball.radius;
    ball.vx = -Math.abs(ball.vx) * bounce;
    hitWall("right");
  }

  if (ball.y - ball.radius < arena.y) {
    ball.y = arena.y + ball.radius;
    ball.vy = Math.abs(ball.vy) * bounce;
    hitWall("top");
  }

  if (ball.y + ball.radius > arena.y + arena.h) {
    ball.y = arena.y + arena.h - ball.radius;
    ball.vy = -Math.abs(ball.vy) * bounce;
    hitWall("bottom");
  }

  ball.squashX += (1 - ball.squashX) * 0.16;
  ball.squashY += (1 - ball.squashY) * 0.16;
  ball.glow += (0 - ball.glow) * 0.08;

  if (flashTimer > 0) flashTimer--;
  updateTrail();
  updateParticles();
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#081225");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 18; i++) {
    ctx.fillRect(0, i * 40, canvas.width, 1);
  }
}

function drawArena() {
  ctx.fillStyle = "#0f172a";
  roundRect(arena.x, arena.y, arena.w, arena.h, 34);
  ctx.fill();

  ctx.strokeStyle = "rgba(147,197,253,0.35)";
  ctx.lineWidth = 4;
  roundRect(arena.x, arena.y, arena.w, arena.h, 34);
  ctx.stroke();

  if (flashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = flashTimer / 10 * 0.35;
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 10;

    if (lastHitSide === "left") {
      ctx.beginPath();
      ctx.moveTo(arena.x, arena.y + 18);
      ctx.lineTo(arena.x, arena.y + arena.h - 18);
      ctx.stroke();
    }

    if (lastHitSide === "right") {
      ctx.beginPath();
      ctx.moveTo(arena.x + arena.w, arena.y + 18);
      ctx.lineTo(arena.x + arena.w, arena.y + arena.h - 18);
      ctx.stroke();
    }

    if (lastHitSide === "top") {
      ctx.beginPath();
      ctx.moveTo(arena.x + 18, arena.y);
      ctx.lineTo(arena.x + arena.w - 18, arena.y);
      ctx.stroke();
    }

    if (lastHitSide === "bottom") {
      ctx.beginPath();
      ctx.moveTo(arena.x + 18, arena.y + arena.h);
      ctx.lineTo(arena.x + arena.w - 18, arena.y + arena.h);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawTrail() {
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const alpha = (i + 1) / trail.length * t.a;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.sx, t.sy);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 30);
    ctx.fillStyle = "#93c5fd";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBall() {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.scale(ball.squashX, ball.squashY);

  const glowRadius = ball.radius + 18 + ball.glow * 12;
  const glow = ctx.createRadialGradient(0, 0, ball.radius * 0.2, 0, 0, glowRadius);
  glow.addColorStop(0, `rgba(147,197,253,${0.28 + ball.glow * 0.22})`);
  glow.addColorStop(1, "rgba(147,197,253,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(-10, -12, 8, 0, 0, ball.radius + 8);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.25, "#bfdbfe");
  grad.addColorStop(0.7, "#60a5fa");
  grad.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(-10, -12, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "white";
  ctx.font = "bold 52px Arial";
  ctx.fillText("Ball Push X", 40, 62);

  ctx.font = "26px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("Push the ball in any direction and smash the walls.", 40, 98);

  ctx.fillText("Phone: D-pad moves • Pause opens menu", 40, canvas.height - 26);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(`Speed X ${ball.vx.toFixed(2)}`, canvas.width - 40, 62);
  ctx.fillText(`Speed Y ${ball.vy.toFixed(2)}`, canvas.width - 40, 94);
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

function handlePressedEvents() {
  const upPressed = input.up && !previousInput.up;
  const downPressed = input.down && !previousInput.down;
  const enterPressed = input.enter && !previousInput.enter;
  const pausePressed = input.pause && !previousInput.pause;

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

  previousInput = { ...input };
}

function drawGame() {
  drawBackground();
  drawArena();
  drawTrail();
  drawParticles();
  drawBall();
  drawHud();
}

function loop() {
  handlePressedEvents();

  if (!paused) {
    updateGame();
  }

  drawGame();

  if (paused) {
    drawPauseOverlay();
  }

  requestAnimationFrame(loop);
}

loop();
