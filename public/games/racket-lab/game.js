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
let combo = 0;
let message = "Tap Start Motion, hold phone like a racket, then swing.";
let messageTimer = 999999;

const court = {
  topY: 150,
  bottomY: 650,
  leftTopX: 350,
  rightTopX: 930,
  leftBottomX: 120,
  rightBottomX: 1160,
  centerX: canvas.width / 2
};

const player = {
  x: canvas.width / 2,
  y: 560,
  bodyTurn: 0,
  swingAnim: 0,
  swingDir: 1
};

const racket = {
  offsetX: 92,
  offsetY: -30,
  visualX: 0,
  visualY: 0,
  faceYaw: 0,
  facePitch: 0
};

const hitZone = {
  x: canvas.width / 2 + 90,
  y: 470,
  w: 180,
  h: 140
};

const ball = {
  x: court.centerX,
  y: 185,
  vx: 0.8,
  vy: 4.9,
  size: 15,
  active: true,
  trail: []
};

const returnBall = {
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0
};

let particles = [];
let prevGamma = 0;
let prevBeta = 0;
let lastSwingTime = 0;
const swingCooldown = 220;

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

function lerp(a, b, t) {
  return a + (b - a) * t;
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

function setMessage(text, time = 48) {
  message = text;
  messageTimer = time;
}

function spawnParticles(x, y, color = "#facc15") {
  for (let i = 0; i < 18; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 18 + Math.random() * 16,
      size: 3 + Math.random() * 4,
      color
    });
  }
}

function resetIncomingBall() {
  ball.x = court.centerX + (Math.random() - 0.5) * 110;
  ball.y = court.topY + 18;
  ball.vx = (Math.random() - 0.5) * 1.5;
  ball.vy = 4.7 + Math.random() * 0.7;
  ball.size = 15;
  ball.active = true;
  ball.trail = [];
}

function courtXAtY(y, side) {
  const t = (y - court.topY) / (court.bottomY - court.topY);
  if (side === "left") return lerp(court.leftTopX, court.leftBottomX, t);
  return lerp(court.rightTopX, court.rightBottomX, t);
}

function updateRacketPose() {
  const tiltX = clamp(input.centeredGamma, -35, 35);
  const tiltY = clamp(input.centeredBeta, -35, 35);

  racket.visualX = tiltX * 4.4;
  racket.visualY = tiltY * 1.7;
  racket.faceYaw = tiltX * 0.9;
  racket.facePitch = tiltY * 0.7;

  player.bodyTurn = tiltX * 0.012;
}

function detectSwing() {
  if (!input.motionEnabled) {
    prevGamma = input.gamma;
    prevBeta = input.beta;
    return null;
  }

  const now = Date.now();
  if (now - lastSwingTime < swingCooldown) {
    prevGamma = input.gamma;
    prevBeta = input.beta;
    return null;
  }

  const deltaGamma = input.gamma - prevGamma;
  const deltaBeta = input.beta - prevBeta;

  prevGamma = input.gamma;
  prevBeta = input.beta;

  const speed = Math.sqrt(deltaGamma * deltaGamma + deltaBeta * deltaBeta);
  const forward = Math.abs(deltaBeta);

  if (speed < 7 || forward < 4) {
    return null;
  }

  lastSwingTime = now;
  player.swingAnim = 1;
  player.swingDir = deltaGamma >= 0 ? 1 : -1;

  return {
    speed,
    deltaGamma,
    deltaBeta
  };
}

function updatePlayerAnimation() {
  if (player.swingAnim > 0) {
    player.swingAnim -= 0.085;
    if (player.swingAnim < 0) player.swingAnim = 0;
  }
}

function getRacketHeadPosition() {
  const swing = player.swingAnim;
  const swingArcX = Math.sin((1 - swing) * Math.PI) * 95 * player.swingDir;
  const swingArcY = Math.sin((1 - swing) * Math.PI) * -40;

  return {
    x: player.x + racket.offsetX + racket.visualX + swingArcX,
    y: player.y + racket.offsetY + racket.visualY + swingArcY
  };
}

function updateIncomingBall() {
  if (!ball.active) return;

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.size += 0.26;

  const leftEdge = courtXAtY(ball.y, "left");
  const rightEdge = courtXAtY(ball.y, "right");

  if (ball.x - ball.size < leftEdge) {
    ball.x = leftEdge + ball.size;
    ball.vx *= -1;
  }

  if (ball.x + ball.size > rightEdge) {
    ball.x = rightEdge - ball.size;
    ball.vx *= -1;
  }

  ball.trail.push({ x: ball.x, y: ball.y, size: ball.size });
  if (ball.trail.length > 10) ball.trail.shift();

  if (ball.y > canvas.height + 80) {
    combo = 0;
    setMessage("MISS");
    spawnParticles(ball.x, player.y - 40, "#ef4444");
    resetIncomingBall();
  }
}

function updateReturnBall() {
  if (!returnBall.active) return;

  returnBall.x += returnBall.vx;
  returnBall.y += returnBall.vy;
  returnBall.vy -= 0.045;
  returnBall.life--;

  if (returnBall.life <= 0 || returnBall.y < court.topY - 50) {
    returnBall.active = false;
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
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function tryHitBall(swing) {
  const head = getRacketHeadPosition();
  const dx = ball.x - head.x;
  const dy = ball.y - head.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 72 + ball.size * 0.45 || ball.y < 360 || ball.y > 600) {
    setMessage("WHIFF", 28);
    spawnParticles(head.x, head.y, "#f97316");
    combo = 0;
    return;
  }

  const timing = Math.abs(ball.y - head.y);
  const faceYaw = clamp(input.centeredGamma, -30, 30);
  const facePitch = clamp(input.centeredBeta, -35, 35);

  let result = "GOOD";
  let color = "#facc15";
  let power = 1.0;
  let scoreAdd = 2;

  if (timing < 18 && swing.speed > 12) {
    result = "PERFECT";
    color = "#22c55e";
    power = 1.34;
    scoreAdd = 4;
    combo++;
  } else if (timing < 34) {
    result = "GOOD";
    color = "#facc15";
    power = 1.08;
    scoreAdd = 2;
    combo++;
  } else {
    result = "LATE";
    color = "#fb923c";
    power = 0.9;
    scoreAdd = 1;
    combo = 0;
  }

  const shotX = clamp(faceYaw * 0.19 + dx * 0.03 + swing.deltaGamma * 0.08, -8, 8);
  const loft = clamp(facePitch * -0.055, -2.5, 2.5);

  returnBall.active = true;
  returnBall.x = ball.x;
  returnBall.y = ball.y;
  returnBall.vx = shotX;
  returnBall.vy = -(7.8 + swing.speed * 0.18) * power + loft;
  returnBall.life = 85;

  const faceText =
    facePitch < -12 ? "OPEN FACE" :
    facePitch > 12 ? "CLOSED FACE" :
    "SQUARE FACE";

  score += scoreAdd + combo;
  spawnParticles(ball.x, ball.y, color);
  setMessage(`${result} • ${faceText}`, 42);

  resetIncomingBall();
}

function handleGameplay() {
  updateRacketPose();
  updatePlayerAnimation();
  updateIncomingBall();
  updateReturnBall();
  updateParticles();

  const swing = detectSwing();
  if (swing) {
    tryHitBall(swing);
  }

  if (messageTimer > 0) messageTimer--;
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
      if (selected.action === "resume") paused = false;
      if (selected.action === "home") window.location.href = "/";
    }
  }

  previousInput.pause = input.pause;
  previousInput.up = input.up;
  previousInput.down = input.down;
  previousInput.enter = input.enter;
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#7dd3fc");
  bg.addColorStop(0.55, "#93c5fd");
  bg.addColorStop(0.56, "#0f172a");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCourt() {
  ctx.fillStyle = "#25603f";
  ctx.beginPath();
  ctx.moveTo(court.leftBottomX, court.bottomY);
  ctx.lineTo(court.rightBottomX, court.bottomY);
  ctx.lineTo(court.rightTopX, court.topY);
  ctx.lineTo(court.leftTopX, court.topY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(court.leftBottomX, court.bottomY);
  ctx.lineTo(court.rightBottomX, court.bottomY);
  ctx.lineTo(court.rightTopX, court.topY);
  ctx.lineTo(court.leftTopX, court.topY);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(court.centerX, court.bottomY);
  ctx.lineTo(court.centerX, court.topY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(250, 380);
  ctx.lineTo(canvas.width - 250, 380);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(270, 315);
  ctx.lineTo(canvas.width - 270, 315);
  ctx.stroke();
}

function drawIncomingTrail() {
  for (let i = 0; i < ball.trail.length; i++) {
    const t = ball.trail[i];
    const alpha = (i + 1) / ball.trail.length * 0.18;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.size * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawIncomingBall() {
  drawIncomingTrail();

  const shadowY = lerp(330, 560, clamp((ball.y - court.topY) / 420, 0, 1));
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.ellipse(ball.x, shadowY, ball.size * 1.0, ball.size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.beginPath();
  ctx.arc(ball.x - 4, ball.y - 4, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawReturnBall() {
  if (!returnBall.active) return;

  const size = clamp(10 + returnBall.life * 0.05, 8, 24);
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(returnBall.x, returnBall.y, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  const swing = player.swingAnim;
  const shoulderX = x + 30;
  const shoulderY = y - 88;
  const head = getRacketHeadPosition();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(x, y - 60);
  ctx.lineTo(x, y + 35);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x - 30, y + 65);
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + 30, y + 65);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - 38);
  ctx.lineTo(x - 52, y + 5);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(head.x - 10, head.y + 26);
  ctx.stroke();

  ctx.fillStyle = "#1d4ed8";
  roundRect(x - 34, y - 80, 68, 80, 18);
  ctx.fill();

  ctx.fillStyle = "#f5d0a6";
  ctx.beginPath();
  ctx.arc(x, y - 112, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(x - 8, y - 118, 4, 0, Math.PI * 2);
  ctx.arc(x + 8, y - 118, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 108, 8, 0.1, Math.PI - 0.1);
  ctx.stroke();

  drawRacket(head.x, head.y, swing);
}

function drawRacket(x, y, swing) {
  const yaw = racket.faceYaw;
  const pitch = racket.facePitch;
  const w = 72 + Math.abs(yaw) * 0.55;
  const h = 108 - Math.abs(pitch) * 0.65;
  const rot = yaw * 0.012 + swing * 0.5 * player.swingDir;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  ctx.strokeStyle = "#c2410c";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 52);
  ctx.lineTo(0, 116);
  ctx.stroke();

  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 2;
  for (let i = -20; i <= 20; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, -h * 0.42);
    ctx.lineTo(i, h * 0.42);
    ctx.stroke();
  }
  for (let j = -36; j <= 36; j += 12) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, j);
    ctx.lineTo(w * 0.35, j);
    ctx.stroke();
  }

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
  ctx.fillText("Racket Lab", 40, 62);

  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("3rd-person racket prototype. Swing like Wii tennis.", 40, 98);

  const status = input.connected
    ? (input.motionEnabled ? "Motion active" : "Controller connected, motion not enabled")
    : "Waiting for controller";

  ctx.fillText(status, 40, 134);
  ctx.fillText(`Racket X ${input.centeredGamma.toFixed(1)}`, 40, 170);
  ctx.fillText(`Racket Face ${input.centeredBeta.toFixed(1)}`, 40, 206);

  ctx.textAlign = "right";
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 40px Arial";
  ctx.fillText(`Score ${score}`, canvas.width - 40, 60);
  ctx.fillText(`Combo ${combo}`, canvas.width - 40, 102);
  ctx.textAlign = "left";
}

function drawMessage() {
  if (messageTimer <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, messageTimer / 18);
  ctx.textAlign = "center";
  ctx.font = "bold 46px Arial";
  ctx.fillStyle =
    message.includes("PERFECT") ? "#22c55e" :
    message.includes("GOOD") ? "#facc15" :
    message.includes("LATE") || message.includes("OPEN") || message.includes("CLOSED") ? "#fb923c" :
    message.includes("MISS") || message.includes("WHIFF") ? "#ef4444" :
    "white";
  ctx.fillText(message, canvas.width / 2, 122);
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
  drawCourt();
  drawReturnBall();
  drawIncomingBall();
  drawPlayer();
  drawParticles();
  drawHud();
  drawMessage();

  if (paused) {
    drawPauseOverlay();
  }

  requestAnimationFrame(loop);
}

resetIncomingBall();
loop();
