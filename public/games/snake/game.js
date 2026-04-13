var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');

// ── Grid config ──
// 1280x720 canvas. Use 40px cells = 32 columns x 18 rows.
var COLS = 32;
var ROWS = 18;
var CELL = 40; // pixels per cell

// ── Game state ──
var snake = [];       // array of {x, y} — head is snake[0]
var dir = { x: 1, y: 0 };   // current direction
var nextDir = { x: 1, y: 0 }; // buffered next direction (prevents 180 flips)
var food = { x: 0, y: 0 };
var score = 0;
var highScore = 0;
var gameOver = false;
var paused = false;
var speed = 8;        // moves per second (starts chill, gets faster)
var moveTimer = 0;
var lastTime = 0;
var started = false;  // waiting for first input to start

// ── Colors ──
var BG_COLOR = '#0f172a';
var GRID_COLOR = 'rgba(255,255,255,0.03)';
var SNAKE_HEAD = '#22c55e';
var SNAKE_BODY = '#16a34a';
var FOOD_COLOR = '#ef4444';
var TEXT_COLOR = '#ffffff';
var DIM_TEXT = 'rgba(255,255,255,0.5)';

// ── Input from controller ──
var input = { left: false, right: false, up: false, down: false, enter: false };
var prevInput = { left: false, right: false, up: false, down: false, enter: false };

partypi.on('input', function(data) {
  input.left = !!data.left;
  input.right = !!data.right;
  input.up = !!data.up;
  input.down = !!data.down;
  input.enter = !!data.enter;
});

partypi.on('pause', function() { paused = true; });
partypi.on('resume', function() { paused = false; });

// ── Init ──
function resetGame() {
  // Start snake in the middle, 3 segments long
  var startX = Math.floor(COLS / 2);
  var startY = Math.floor(ROWS / 2);
  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  speed = 8;
  gameOver = false;
  moveTimer = 0;
  spawnFood();
}

function spawnFood() {
  // Find all empty cells
  var empty = [];
  for (var x = 0; x < COLS; x++) {
    for (var y = 0; y < ROWS; y++) {
      var occupied = false;
      for (var i = 0; i < snake.length; i++) {
        if (snake[i].x === x && snake[i].y === y) {
          occupied = true;
          break;
        }
      }
      if (!occupied) {
        empty.push({ x: x, y: y });
      }
    }
  }
  if (empty.length > 0) {
    food = empty[Math.floor(Math.random() * empty.length)];
  }
}

function moveSnake() {
  // Apply buffered direction
  dir.x = nextDir.x;
  dir.y = nextDir.y;

  var head = snake[0];
  var newHead = { x: head.x + dir.x, y: head.y + dir.y };

  // Wall collision — wrap around
  if (newHead.x < 0) newHead.x = COLS - 1;
  if (newHead.x >= COLS) newHead.x = 0;
  if (newHead.y < 0) newHead.y = ROWS - 1;
  if (newHead.y >= ROWS) newHead.y = 0;

  // Self collision
  for (var i = 0; i < snake.length; i++) {
    if (snake[i].x === newHead.x && snake[i].y === newHead.y) {
      gameOver = true;
      if (score > highScore) highScore = score;
      return;
    }
  }

  // Add new head
  snake.unshift(newHead);

  // Check food
  if (newHead.x === food.x && newHead.y === food.y) {
    score++;
    // Speed up slightly every 5 points, cap at 18
    if (score % 5 === 0 && speed < 18) {
      speed += 1;
    }
    spawnFood();
  } else {
    // Remove tail (no growth)
    snake.pop();
  }
}

// ── Input handling ──
function handleInput() {
  var leftPressed = input.left && !prevInput.left;
  var rightPressed = input.right && !prevInput.right;
  var upPressed = input.up && !prevInput.up;
  var downPressed = input.down && !prevInput.down;
  var enterPressed = input.enter && !prevInput.enter;

  if (!started) {
    if (leftPressed || rightPressed || upPressed || downPressed || enterPressed) {
      started = true;
      resetGame();
    }
  } else if (gameOver) {
    if (enterPressed || leftPressed || rightPressed || upPressed || downPressed) {
      started = true;
      resetGame();
    }
  } else {
    // Buffer direction changes — prevent 180-degree flip
    if (leftPressed && dir.x !== 1) {
      nextDir = { x: -1, y: 0 };
    } else if (rightPressed && dir.x !== -1) {
      nextDir = { x: 1, y: 0 };
    } else if (upPressed && dir.y !== 1) {
      nextDir = { x: 0, y: -1 };
    } else if (downPressed && dir.y !== -1) {
      nextDir = { x: 0, y: 1 };
    }
  }

  prevInput.left = input.left;
  prevInput.right = input.right;
  prevInput.up = input.up;
  prevInput.down = input.down;
  prevInput.enter = input.enter;
}

// ── Drawing (kept minimal for Pi performance) ──

function drawGrid() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle grid lines
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  for (var x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, ROWS * CELL);
    ctx.stroke();
  }
  for (var y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(COLS * CELL, y * CELL);
    ctx.stroke();
  }
}

function drawSnake() {
  for (var i = 0; i < snake.length; i++) {
    var seg = snake[i];
    var gap = 1; // tiny gap between segments for visual clarity
    if (i === 0) {
      // Head — slightly brighter
      ctx.fillStyle = SNAKE_HEAD;
    } else {
      ctx.fillStyle = SNAKE_BODY;
    }
    ctx.fillRect(
      seg.x * CELL + gap,
      seg.y * CELL + gap,
      CELL - gap * 2,
      CELL - gap * 2
    );
  }
}

function drawFood() {
  ctx.fillStyle = FOOD_COLOR;
  ctx.fillRect(
    food.x * CELL + 2,
    food.y * CELL + 2,
    CELL - 4,
    CELL - 4
  );
}

function drawHud() {
  // Score — top left
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Score: ' + score, 20, 42);

  // High score — top right
  ctx.textAlign = 'right';
  ctx.fillStyle = DIM_TEXT;
  ctx.font = '28px Arial';
  ctx.fillText('Best: ' + highScore, canvas.width - 20, 42);
  ctx.textAlign = 'left';
}

function drawTitleScreen() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px Arial';
  ctx.fillText('Snake', canvas.width / 2, canvas.height / 2 - 40);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '32px Arial';
  ctx.fillText('Press any button to start', canvas.width / 2, canvas.height / 2 + 30);

  if (highScore > 0) {
    ctx.fillStyle = DIM_TEXT;
    ctx.font = '26px Arial';
    ctx.fillText('Best: ' + highScore, canvas.width / 2, canvas.height / 2 + 80);
  }

  ctx.textAlign = 'left';
}

function drawGameOver() {
  // Dim overlay
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px Arial';
  ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 40);

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 48px Arial';
  ctx.fillText('Score: ' + score, canvas.width / 2, canvas.height / 2 + 30);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '28px Arial';
  ctx.fillText('Press any button to play again', canvas.width / 2, canvas.height / 2 + 90);

  ctx.textAlign = 'left';
}

// ── Main loop ──
function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  var dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  handleInput();

  if (!started) {
    drawTitleScreen();
    requestAnimationFrame(loop);
    return;
  }

  if (!paused && !gameOver) {
    moveTimer += dt;
    var moveInterval = 1 / speed;
    while (moveTimer >= moveInterval) {
      moveTimer -= moveInterval;
      moveSnake();
    }
  }

  // Draw everything
  drawGrid();
  drawSnake();
  drawFood();
  drawHud();

  if (gameOver) {
    drawGameOver();
  }

  requestAnimationFrame(loop);
}

// Don't auto-start — show title screen and wait for input
resetGame();
started = false;
requestAnimationFrame(loop);
