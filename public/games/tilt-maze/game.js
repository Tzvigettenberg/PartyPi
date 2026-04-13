var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');

// ── Maze grid config ──
// Canvas is 1280x720.
// Maze cells: odd coords are rooms, even coords are walls/gaps.
// We'll use a grid approach where the maze fills most of the screen
// with a HUD bar at the top.

var HUD_H = 50;       // top bar height for score/level/timer
var MAZE_Y = HUD_H;   // maze starts below HUD
var MAZE_H = canvas.height - HUD_H; // 670px for maze

// Cell size — needs to divide evenly into maze dimensions
// Using 670/CELL for rows. Let's pick CELL=32 → 670/32=20.9 → use 20 rows (640px)
// 1280/32=40 cols. Good.
var CELL = 32;
var COLS = Math.floor(canvas.width / CELL);   // 40
var ROWS = Math.floor(MAZE_H / CELL);          // 20
var MAZE_W = COLS * CELL;  // actual maze pixel width
var MAZE_X = Math.floor((canvas.width - MAZE_W) / 2); // center horizontally

// Maze grid: 0 = wall, 1 = path
var grid = [];

// Logical maze rooms are at odd coordinates
var ROOM_COLS = Math.floor((COLS - 1) / 2);  // 19
var ROOM_ROWS = Math.floor((ROWS - 1) / 2);  // 9

// ── Ball (pixel-based movement within the grid) ──
var ball = {
  x: 0, y: 0,    // pixel position (center of ball)
  vx: 0, vy: 0,
  radius: CELL * 0.35
};

var BALL_ACCEL = 0.4;      // how much tilt accelerates
var BALL_MAX_SPEED = 7;
var BALL_DRAG = 0.91;

// ── Game state ──
var level = 1;
var timer = 0;
var bestTime = 0;
var paused = false;
var started = false;
var levelComplete = false;
var levelCompleteTimer = 0;
var startCell = { x: 0, y: 0 };  // grid coords
var endCell = { x: 0, y: 0 };    // grid coords

// ── Gyro input ──
var tiltX = 0; // centeredGamma: left/right
var tiltY = 0; // centeredBeta: forward/back

partypi.on('gyro', function(data) {
  tiltX = data.centeredGamma || 0;
  tiltY = data.centeredBeta || 0;
  if (!started) started = true;
});

partypi.on('pause', function() { paused = true; });
partypi.on('resume', function() { paused = false; });

// ── Colors ──
var BG_COLOR = '#0f172a';
var WALL_COLOR = '#1e293b';
var PATH_COLOR = '#0f172a';
var BALL_COLOR = '#a78bfa';
var START_COLOR = 'rgba(34,197,94,0.3)';
var END_COLOR = 'rgba(239,68,68,0.4)';
var TEXT_COLOR = '#ffffff';
var DIM_TEXT = 'rgba(255,255,255,0.5)';

// ── Maze Generation (Recursive Backtracker / DFS) ──
// Guarantees a perfect maze — exactly one path between any two rooms.

function initGrid() {
  grid = [];
  for (var x = 0; x < COLS; x++) {
    grid[x] = [];
    for (var y = 0; y < ROWS; y++) {
      grid[x][y] = 0; // everything starts as wall
    }
  }
}

function generateMaze() {
  initGrid();

  // Mark all room cells as visited tracker
  var visited = [];
  for (var rx = 0; rx < ROOM_COLS; rx++) {
    visited[rx] = [];
    for (var ry = 0; ry < ROOM_ROWS; ry++) {
      visited[rx][ry] = false;
    }
  }

  // Convert room coords to grid coords
  function roomToGrid(rx, ry) {
    return { x: rx * 2 + 1, y: ry * 2 + 1 };
  }

  // Shuffle array in place
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // DFS carve
  var stack = [];
  var sx = 0;
  var sy = 0;
  visited[sx][sy] = true;

  var g = roomToGrid(sx, sy);
  grid[g.x][g.y] = 1; // open start room

  stack.push({ x: sx, y: sy });

  while (stack.length > 0) {
    var current = stack[stack.length - 1];
    var cx = current.x;
    var cy = current.y;

    // Find unvisited neighbors
    var neighbors = [];
    var dirs = shuffle([
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 }
    ]);

    for (var d = 0; d < dirs.length; d++) {
      var nx = cx + dirs[d].dx;
      var ny = cy + dirs[d].dy;
      if (nx >= 0 && nx < ROOM_COLS && ny >= 0 && ny < ROOM_ROWS && !visited[nx][ny]) {
        neighbors.push({ x: nx, y: ny, dx: dirs[d].dx, dy: dirs[d].dy });
      }
    }

    if (neighbors.length === 0) {
      stack.pop();
    } else {
      var next = neighbors[0]; // already shuffled
      visited[next.x][next.y] = true;

      // Open the room cell
      var ng = roomToGrid(next.x, next.y);
      grid[ng.x][ng.y] = 1;

      // Open the wall between current and next
      var cg = roomToGrid(cx, cy);
      var wallX = cg.x + next.dx;
      var wallY = cg.y + next.dy;
      grid[wallX][wallY] = 1;

      stack.push({ x: next.x, y: next.y });
    }
  }

  // Set start and end
  startCell = roomToGrid(0, 0);
  endCell = roomToGrid(ROOM_COLS - 1, ROOM_ROWS - 1);
}

// ── Level setup ──
function startLevel() {
  generateMaze();
  levelComplete = false;
  levelCompleteTimer = 0;
  timer = 0;

  // Place ball at start
  ball.x = MAZE_X + startCell.x * CELL + CELL / 2;
  ball.y = MAZE_Y + startCell.y * CELL + CELL / 2;
  ball.vx = 0;
  ball.vy = 0;
}

// ── Collision detection ──
// Check if a circle at (px, py) with given radius collides with any wall cell.
// Returns the corrected position.

function collideAndSlide(px, py, vx, vy, radius) {
  // Try moving on X first, then Y (allows sliding along walls)
  var newX = px + vx;
  var newY = py + vy;

  // Check X movement
  if (!circleCollidesWall(newX, py, radius)) {
    px = newX;
  } else {
    // Stop X velocity
    ball.vx = 0;
  }

  // Check Y movement
  if (!circleCollidesWall(px, newY, radius)) {
    py = newY;
  } else {
    ball.vy = 0;
  }

  return { x: px, y: py };
}

function circleCollidesWall(cx, cy, radius) {
  // Check all grid cells the circle could overlap
  var left = Math.floor((cx - radius - MAZE_X) / CELL);
  var right = Math.floor((cx + radius - MAZE_X) / CELL);
  var top = Math.floor((cy - radius - MAZE_Y) / CELL);
  var bottom = Math.floor((cy + radius - MAZE_Y) / CELL);

  for (var gx = left; gx <= right; gx++) {
    for (var gy = top; gy <= bottom; gy++) {
      // Out of bounds = wall
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
      if (grid[gx][gy] === 0) {
        // This is a wall cell — check circle vs rectangle collision
        var rectX = MAZE_X + gx * CELL;
        var rectY = MAZE_Y + gy * CELL;
        if (circleRectOverlap(cx, cy, radius, rectX, rectY, CELL, CELL)) {
          return true;
        }
      }
    }
  }
  return false;
}

function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  var closestX = Math.max(rx, Math.min(cx, rx + rw));
  var closestY = Math.max(ry, Math.min(cy, ry + rh));
  var dx = cx - closestX;
  var dy = cy - closestY;
  return (dx * dx + dy * dy) < (r * r);
}

// ── Check if ball reached the end ──
function checkWin() {
  var endPx = MAZE_X + endCell.x * CELL + CELL / 2;
  var endPy = MAZE_Y + endCell.y * CELL + CELL / 2;
  var dx = ball.x - endPx;
  var dy = ball.y - endPy;
  var dist = Math.sqrt(dx * dx + dy * dy);
  return dist < CELL * 0.6;
}

// ── Update ──
function update(dt) {
  if (levelComplete) {
    levelCompleteTimer += dt;
    if (levelCompleteTimer > 2.5) {
      level++;
      startLevel();
    }
    return;
  }

  timer += dt;

  // Apply tilt to velocity
  // Clamp tilt to ±45 degrees, normalize to -1..1
  var normX = Math.max(-1, Math.min(1, tiltX / 30));
  var normY = Math.max(-1, Math.min(1, tiltY / 30));

  ball.vx += normX * BALL_ACCEL;
  ball.vy += normY * BALL_ACCEL;

  // Clamp speed
  ball.vx = Math.max(-BALL_MAX_SPEED, Math.min(BALL_MAX_SPEED, ball.vx));
  ball.vy = Math.max(-BALL_MAX_SPEED, Math.min(BALL_MAX_SPEED, ball.vy));

  // Apply drag
  ball.vx *= BALL_DRAG;
  ball.vy *= BALL_DRAG;

  // Stop tiny velocities
  if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.05) ball.vy = 0;

  // Move with collision
  var result = collideAndSlide(ball.x, ball.y, ball.vx, ball.vy, ball.radius);
  ball.x = result.x;
  ball.y = result.y;

  // Check win
  if (checkWin()) {
    levelComplete = true;
    levelCompleteTimer = 0;
    if (bestTime === 0 || timer < bestTime) {
      bestTime = timer;
    }
  }
}

// ── Drawing ──

function drawMaze() {
  // Fill background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw wall cells
  ctx.fillStyle = WALL_COLOR;
  for (var x = 0; x < COLS; x++) {
    for (var y = 0; y < ROWS; y++) {
      if (grid[x][y] === 0) {
        ctx.fillRect(MAZE_X + x * CELL, MAZE_Y + y * CELL, CELL, CELL);
      }
    }
  }

  // Draw start zone
  ctx.fillStyle = START_COLOR;
  ctx.fillRect(MAZE_X + startCell.x * CELL, MAZE_Y + startCell.y * CELL, CELL, CELL);

  // Draw end zone
  ctx.fillStyle = END_COLOR;
  ctx.fillRect(MAZE_X + endCell.x * CELL, MAZE_Y + endCell.y * CELL, CELL, CELL);

  // End marker — simple "X" or target
  var ex = MAZE_X + endCell.x * CELL + CELL / 2;
  var ey = MAZE_Y + endCell.y * CELL + CELL / 2;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ex, ey, CELL * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, ey, CELL * 0.12, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBall() {
  ctx.fillStyle = BALL_COLOR;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  // Small highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(ball.x - ball.radius * 0.25, ball.y - ball.radius * 0.25, ball.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function formatTime(t) {
  var mins = Math.floor(t / 60);
  var secs = Math.floor(t % 60);
  var ms = Math.floor((t % 1) * 10);
  if (mins > 0) {
    return mins + ':' + (secs < 10 ? '0' : '') + secs + '.' + ms;
  }
  return secs + '.' + ms + 's';
}

function drawHud() {
  // HUD background
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  ctx.fillRect(0, 0, canvas.width, HUD_H);

  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'left';

  // Level
  ctx.fillStyle = BALL_COLOR;
  ctx.fillText('Level ' + level, 20, 35);

  // Timer
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.fillText(formatTime(timer), canvas.width / 2, 35);

  // Best time
  ctx.textAlign = 'right';
  ctx.fillStyle = DIM_TEXT;
  ctx.font = '22px Arial';
  if (bestTime > 0) {
    ctx.fillText('Best: ' + formatTime(bestTime), canvas.width - 20, 35);
  }

  ctx.textAlign = 'left';
}

function drawTitleScreen() {
  drawMaze();
  drawBall();

  // Overlay
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px Arial';
  ctx.fillText('Tilt Maze', canvas.width / 2, canvas.height / 2 - 40);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '28px Arial';
  ctx.fillText('Enable gyro and tilt your phone to start', canvas.width / 2, canvas.height / 2 + 20);

  ctx.textAlign = 'left';
}

function drawLevelComplete() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#22c55e';
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('Level ' + level + ' Complete!', canvas.width / 2, canvas.height / 2 - 30);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 36px Arial';
  ctx.fillText(formatTime(timer), canvas.width / 2, canvas.height / 2 + 25);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '24px Arial';
  ctx.fillText('Next level in a moment...', canvas.width / 2, canvas.height / 2 + 70);

  ctx.textAlign = 'left';
}

// ── Main loop ──
var lastTime = 0;

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  var dt = (timestamp - lastTime) / 1000;
  // Cap dt to prevent huge jumps after tab switch
  if (dt > 0.1) dt = 0.016;
  lastTime = timestamp;

  if (!started) {
    drawTitleScreen();
    requestAnimationFrame(loop);
    return;
  }

  if (!paused) {
    update(dt);
  }

  drawMaze();
  drawBall();
  drawHud();

  if (levelComplete) {
    drawLevelComplete();
  }

  requestAnimationFrame(loop);
}

// Init
startLevel();
requestAnimationFrame(loop);
