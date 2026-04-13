var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');

// ── Grid config ──
// Canvas 1280x720. Store area on left, shopping list on right.
var CELL = 32;
var STORE_COLS = 28;  // 28 * 32 = 896px for store
var STORE_ROWS = 20;  // 20 * 32 = 640px
var STORE_X = 16;     // left padding
var STORE_Y = 64;     // top padding (HUD above)
var LIST_X = STORE_X + STORE_COLS * CELL + 24; // shopping list panel

// ── Store layout ──
// 0 = floor, 1 = shelf (wall), 2 = checkout counter
var storeMap = [];

// ── Items ──
var ALL_ITEMS = [
  { name: 'Milk',      color: '#f0f9ff', shelfColor: '#bae6fd', emoji: 'M' },
  { name: 'Bread',     color: '#fef3c7', shelfColor: '#fde68a', emoji: 'B' },
  { name: 'Eggs',      color: '#fef9c3', shelfColor: '#fde047', emoji: 'E' },
  { name: 'Cheese',    color: '#fef08a', shelfColor: '#facc15', emoji: 'C' },
  { name: 'Apples',    color: '#dcfce7', shelfColor: '#86efac', emoji: 'A' },
  { name: 'Chicken',   color: '#ffe4e6', shelfColor: '#fda4af', emoji: 'K' },
  { name: 'Rice',      color: '#f5f5f4', shelfColor: '#d6d3d1', emoji: 'R' },
  { name: 'Juice',     color: '#fed7aa', shelfColor: '#fdba74', emoji: 'J' },
  { name: 'Cereal',    color: '#e9d5ff', shelfColor: '#c084fc', emoji: 'L' },
  { name: 'Butter',    color: '#fef9c3', shelfColor: '#fde047', emoji: 'U' },
  { name: 'Pasta',     color: '#fecaca', shelfColor: '#fca5a5', emoji: 'P' },
  { name: 'Tomato',    color: '#fee2e2', shelfColor: '#f87171', emoji: 'T' },
  { name: 'Banana',    color: '#fef9c3', shelfColor: '#facc15', emoji: 'N' },
  { name: 'Water',     color: '#dbeafe', shelfColor: '#93c5fd', emoji: 'W' },
  { name: 'Chips',     color: '#ffedd5', shelfColor: '#fdba74', emoji: 'H' },
  { name: 'Yogurt',    color: '#fce7f3', shelfColor: '#f9a8d4', emoji: 'Y' },
  { name: 'Cookies',   color: '#d4a574', shelfColor: '#a67c52', emoji: 'O' },
  { name: 'Soda',      color: '#cffafe', shelfColor: '#67e8f9', emoji: 'S' },
  { name: 'Fish',      color: '#e0f2fe', shelfColor: '#7dd3fc', emoji: 'F' },
  { name: 'Onion',     color: '#fef3c7', shelfColor: '#f59e0b', emoji: 'I' }
];

// Placed items in the store (on shelves)
var placedItems = [];  // { x, y, itemIndex, collected }
var shoppingList = []; // indices into ALL_ITEMS
var collectedCount = 0;

// ── Player ──
var player = { x: 0, y: 0 }; // grid coords
var playerPixel = { x: 0, y: 0 }; // smooth pixel position
var PLAYER_SPEED = 4.5; // pixels per frame for smooth movement
var targetPixel = { x: 0, y: 0 };
var moving = false;

// ── Game state ──
var level = 1;
var timer = 0;
var timeLimit = 0;
var penalty = 0;
var gameOver = false;
var levelComplete = false;
var levelCompleteTimer = 0;
var paused = false;
var started = false;
var score = 0;
var totalScore = 0;

// ── Input ──
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

// ── Colors ──
var FLOOR_COLOR = '#1e293b';
var SHELF_COLOR = '#475569';
var SHELF_TOP = '#64748b';
var CHECKOUT_COLOR = '#7c3aed';
var PLAYER_COLOR = '#22c55e';
var PLAYER_CART = '#16a34a';
var BG_COLOR = '#0f172a';
var TEXT_COLOR = '#ffffff';
var DIM_TEXT = 'rgba(255,255,255,0.5)';
var LIST_BG = 'rgba(255,255,255,0.05)';
var COLLECTED_COLOR = '#22c55e';
var WRONG_FLASH = '#ef4444';

var wrongFlash = 0;
var correctFlash = 0;
var flashItem = '';

// ── Build store layout ──
function buildStore() {
  storeMap = [];
  for (var x = 0; x < STORE_COLS; x++) {
    storeMap[x] = [];
    for (var y = 0; y < STORE_ROWS; y++) {
      storeMap[x][y] = 0; // floor
    }
  }

  // Outer walls (top and bottom rows, left and right cols)
  for (var x = 0; x < STORE_COLS; x++) {
    storeMap[x][0] = 1;
    storeMap[x][STORE_ROWS - 1] = 1;
  }
  for (var y = 0; y < STORE_ROWS; y++) {
    storeMap[0][y] = 1;
    storeMap[STORE_COLS - 1][y] = 1;
  }

  // Entrance gap (bottom wall)
  storeMap[1][STORE_ROWS - 1] = 0;
  storeMap[2][STORE_ROWS - 1] = 0;

  // Aisle shelves — horizontal shelves with gaps for walking
  // Each shelf is 2 cells tall, with aisles between them
  // Shelves at rows: 3-4, 7-8, 11-12, 15-16
  var shelfRows = [3, 7, 11, 15];
  for (var s = 0; s < shelfRows.length; s++) {
    var row = shelfRows[s];
    // Shelves from col 3 to col 25, with gaps every few cells
    for (var x = 3; x < STORE_COLS - 3; x++) {
      // Leave gaps for cross-aisles at col 9, 14, 19
      if (x === 9 || x === 10 || x === 14 || x === 15 || x === 19 || x === 20) continue;
      storeMap[x][row] = 1;
      storeMap[x][row + 1] = 1;
    }
  }

  // Checkout counter near entrance
  for (var x = 5; x < 12; x++) {
    storeMap[x][STORE_ROWS - 3] = 2;
  }
}

// ── Place items on/near shelves ──
function placeItems() {
  placedItems = [];
  collectedCount = 0;

  // Find all valid item positions (floor cells adjacent to shelves)
  var itemSpots = [];
  for (var x = 2; x < STORE_COLS - 2; x++) {
    for (var y = 2; y < STORE_ROWS - 2; y++) {
      if (storeMap[x][y] !== 0) continue; // must be floor
      // Check if adjacent to a shelf
      if (
        (storeMap[x-1] && storeMap[x-1][y] === 1) ||
        (storeMap[x+1] && storeMap[x+1][y] === 1) ||
        storeMap[x][y-1] === 1 ||
        storeMap[x][y+1] === 1
      ) {
        itemSpots.push({ x: x, y: y });
      }
    }
  }

  // Shuffle spots
  for (var i = itemSpots.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = itemSpots[i];
    itemSpots[i] = itemSpots[j];
    itemSpots[j] = tmp;
  }

  // Place items (more than shopping list so there are distractors)
  var numToPlace = Math.min(itemSpots.length, ALL_ITEMS.length);
  for (var i = 0; i < numToPlace; i++) {
    placedItems.push({
      x: itemSpots[i].x,
      y: itemSpots[i].y,
      itemIndex: i,
      collected: false
    });
  }
}

// ── Generate shopping list ──
function generateShoppingList() {
  var listSize = Math.min(3 + level, 10); // starts at 4 items, max 10
  var indices = [];
  for (var i = 0; i < ALL_ITEMS.length; i++) indices.push(i);
  // Shuffle
  for (var i = indices.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  shoppingList = indices.slice(0, listSize);
}

// ── Level setup ──
function startLevel() {
  buildStore();
  generateShoppingList();
  placeItems();

  // Time limit: 30s base + 8s per item
  timeLimit = 30 + shoppingList.length * 8;
  timer = timeLimit;
  penalty = 0;
  score = 0;
  gameOver = false;
  levelComplete = false;
  levelCompleteTimer = 0;
  wrongFlash = 0;
  correctFlash = 0;

  // Player starts near entrance
  player.x = 2;
  player.y = STORE_ROWS - 2;
  playerPixel.x = STORE_X + player.x * CELL + CELL / 2;
  playerPixel.y = STORE_Y + player.y * CELL + CELL / 2;
  targetPixel.x = playerPixel.x;
  targetPixel.y = playerPixel.y;
  moving = false;
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
      startLevel();
    }
  } else if (gameOver || levelComplete) {
    if (enterPressed || leftPressed || rightPressed || upPressed || downPressed) {
      if (gameOver) {
        level = 1;
        totalScore = 0;
        started = true;
        startLevel();
      } else if (levelComplete && levelCompleteTimer > 1.5) {
        level++;
        startLevel();
      }
    }
  } else if (!moving) {
    // Move player - check grid collision
    var dx = 0, dy = 0;

    // Allow holding direction for continuous movement
    if (input.left) dx = -1;
    else if (input.right) dx = 1;
    else if (input.up) dy = -1;
    else if (input.down) dy = 1;

    if (dx !== 0 || dy !== 0) {
      var nx = player.x + dx;
      var ny = player.y + dy;

      if (nx >= 0 && nx < STORE_COLS && ny >= 0 && ny < STORE_ROWS) {
        if (storeMap[nx][ny] === 0 || storeMap[nx][ny] === 2) {
          player.x = nx;
          player.y = ny;
          targetPixel.x = STORE_X + nx * CELL + CELL / 2;
          targetPixel.y = STORE_Y + ny * CELL + CELL / 2;
          moving = true;
        }
      }
    }
  }

  prevInput.left = input.left;
  prevInput.right = input.right;
  prevInput.up = input.up;
  prevInput.down = input.down;
  prevInput.enter = input.enter;
}

// ── Smooth movement ──
function updateMovement() {
  if (!moving) return;

  var dx = targetPixel.x - playerPixel.x;
  var dy = targetPixel.y - playerPixel.y;
  var dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < PLAYER_SPEED) {
    playerPixel.x = targetPixel.x;
    playerPixel.y = targetPixel.y;
    moving = false;

    // Check item pickup at new position
    checkPickup();
  } else {
    playerPixel.x += (dx / dist) * PLAYER_SPEED;
    playerPixel.y += (dy / dist) * PLAYER_SPEED;
  }
}

// ── Item pickup ──
function checkPickup() {
  for (var i = 0; i < placedItems.length; i++) {
    var item = placedItems[i];
    if (item.collected) continue;
    if (item.x === player.x && item.y === player.y) {
      item.collected = true;

      // Is it on the shopping list?
      var onList = false;
      for (var j = 0; j < shoppingList.length; j++) {
        if (shoppingList[j] === item.itemIndex) {
          onList = true;
          break;
        }
      }

      if (onList) {
        collectedCount++;
        score += 100;
        correctFlash = 12;
        flashItem = ALL_ITEMS[item.itemIndex].name;

        // Check win
        if (collectedCount >= shoppingList.length) {
          levelComplete = true;
          levelCompleteTimer = 0;
          // Time bonus
          var timeBonus = Math.floor(timer * 10);
          score += timeBonus;
          totalScore += score;
        }
      } else {
        // Wrong item — time penalty
        penalty += 5;
        timer -= 5;
        wrongFlash = 12;
        flashItem = ALL_ITEMS[item.itemIndex].name;
      }
      break;
    }
  }
}

// ── Update ──
function update(dt) {
  if (levelComplete) {
    levelCompleteTimer += dt;
    return;
  }

  timer -= dt;
  if (wrongFlash > 0) wrongFlash--;
  if (correctFlash > 0) correctFlash--;

  if (timer <= 0) {
    timer = 0;
    gameOver = true;
    totalScore += score;
    return;
  }

  updateMovement();
}

// ── Drawing ──

function drawStore() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (var x = 0; x < STORE_COLS; x++) {
    for (var y = 0; y < STORE_ROWS; y++) {
      var px = STORE_X + x * CELL;
      var py = STORE_Y + y * CELL;

      if (storeMap[x][y] === 0) {
        // Floor — subtle tile pattern
        ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_COLOR : '#1a2537';
        ctx.fillRect(px, py, CELL, CELL);
      } else if (storeMap[x][y] === 1) {
        // Shelf
        ctx.fillStyle = SHELF_COLOR;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = SHELF_TOP;
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      } else if (storeMap[x][y] === 2) {
        // Checkout counter
        ctx.fillStyle = CHECKOUT_COLOR;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      }
    }
  }
}

function drawItems() {
  for (var i = 0; i < placedItems.length; i++) {
    var item = placedItems[i];
    if (item.collected) continue;

    var px = STORE_X + item.x * CELL;
    var py = STORE_Y + item.y * CELL;
    var data = ALL_ITEMS[item.itemIndex];

    // Item background
    ctx.fillStyle = data.shelfColor;
    ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);

    // Item letter
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(data.emoji, px + CELL / 2, py + CELL / 2 + 5);
  }
  ctx.textAlign = 'left';
}

function drawPlayer() {
  var px = playerPixel.x;
  var py = playerPixel.y;
  var r = CELL / 2 - 2;

  // Cart body
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(px - r, py - r, r * 2, r * 2);

  // Inner
  ctx.fillStyle = PLAYER_CART;
  ctx.fillRect(px - r + 3, py - r + 3, r * 2 - 6, r * 2 - 6);

  // Cart icon (simple)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('You', px, py + 5);
  ctx.textAlign = 'left';
}

function drawShoppingList() {
  var panelW = canvas.width - LIST_X - 16;
  var panelY = STORE_Y;

  // Panel background
  ctx.fillStyle = LIST_BG;
  ctx.fillRect(LIST_X, panelY, panelW, STORE_ROWS * CELL);

  // Title
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Shopping List', LIST_X + 14, panelY + 32);

  // Items
  var itemY = panelY + 58;
  var itemH = 38;

  for (var i = 0; i < shoppingList.length; i++) {
    var idx = shoppingList[i];
    var data = ALL_ITEMS[idx];

    // Check if collected
    var collected = false;
    for (var j = 0; j < placedItems.length; j++) {
      if (placedItems[j].itemIndex === idx && placedItems[j].collected) {
        collected = true;
        break;
      }
    }

    var y = itemY + i * itemH;

    if (collected) {
      // Collected — green with strikethrough
      ctx.fillStyle = 'rgba(34,197,94,0.15)';
      ctx.fillRect(LIST_X + 8, y - 14, panelW - 16, itemH - 4);

      ctx.fillStyle = COLLECTED_COLOR;
      ctx.font = '20px Arial';
      ctx.fillText('  ' + data.name, LIST_X + 14, y + 6);

      // Strikethrough line
      ctx.strokeStyle = COLLECTED_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(LIST_X + 18, y + 1);
      ctx.lineTo(LIST_X + 18 + ctx.measureText('  ' + data.name).width, y + 1);
      ctx.stroke();
    } else {
      // Not collected
      ctx.fillStyle = data.shelfColor;
      ctx.fillRect(LIST_X + 14, y - 8, 18, 18);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(data.emoji, LIST_X + 23, y + 5);
      ctx.textAlign = 'left';

      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '20px Arial';
      ctx.fillText('  ' + data.name, LIST_X + 34, y + 6);
    }
  }

  // Progress
  ctx.fillStyle = DIM_TEXT;
  ctx.font = '18px Arial';
  ctx.fillText(collectedCount + ' / ' + shoppingList.length + ' items', LIST_X + 14, panelY + STORE_ROWS * CELL - 16);
}

function drawHud() {
  // Top HUD bar
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, STORE_Y);

  // Level
  ctx.fillStyle = '#a78bfa';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Level ' + level, STORE_X, 44);

  // Timer
  var timerColor = timer > 15 ? TEXT_COLOR : timer > 5 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = timerColor;
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(timer) + 's', STORE_X + (STORE_COLS * CELL) / 2, 44);

  // Score
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('Score: ' + (totalScore + score), LIST_X + (canvas.width - LIST_X - 16) / 2 + LIST_X / 2, 44);

  ctx.textAlign = 'left';

  // Flash feedback
  if (correctFlash > 0) {
    ctx.fillStyle = 'rgba(34,197,94,' + (correctFlash / 12 * 0.6) + ')';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('+' + flashItem + '!', STORE_X + (STORE_COLS * CELL) / 2, STORE_Y + 30);
    ctx.textAlign = 'left';
  }

  if (wrongFlash > 0) {
    ctx.fillStyle = 'rgba(239,68,68,' + (wrongFlash / 12 * 0.8) + ')';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Wrong item! -5s', STORE_X + (STORE_COLS * CELL) / 2, STORE_Y + 30);
    ctx.textAlign = 'left';
  }
}

function drawTitleScreen() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.font = 'bold 64px Arial';
  ctx.fillText('Supermarket Dash', canvas.width / 2, canvas.height / 2 - 60);

  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('Grab everything on your list!', canvas.width / 2, canvas.height / 2);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '26px Arial';
  ctx.fillText('Wrong items cost you 5 seconds', canvas.width / 2, canvas.height / 2 + 50);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '28px Arial';
  ctx.fillText('Press any button to start', canvas.width / 2, canvas.height / 2 + 110);

  ctx.textAlign = 'left';
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ef4444';
  ctx.textAlign = 'center';
  ctx.font = 'bold 60px Arial';
  ctx.fillText("Time's Up!", canvas.width / 2, canvas.height / 2 - 50);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 40px Arial';
  ctx.fillText('Total Score: ' + totalScore, canvas.width / 2, canvas.height / 2 + 10);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '24px Arial';
  ctx.fillText('Got ' + collectedCount + ' of ' + shoppingList.length + ' items', canvas.width / 2, canvas.height / 2 + 55);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '28px Arial';
  ctx.fillText('Press any button to try again', canvas.width / 2, canvas.height / 2 + 110);

  ctx.textAlign = 'left';
}

function drawLevelComplete() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#22c55e';
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px Arial';
  ctx.fillText('Level ' + level + ' Complete!', canvas.width / 2, canvas.height / 2 - 50);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 36px Arial';
  ctx.fillText('Score: ' + score + '  (Time bonus: ' + Math.floor(timer * 10) + ')', canvas.width / 2, canvas.height / 2 + 10);

  ctx.fillStyle = DIM_TEXT;
  ctx.font = '26px Arial';
  ctx.fillText('Press any button for next level', canvas.width / 2, canvas.height / 2 + 70);

  ctx.textAlign = 'left';
}

// ── Main loop ──
var lastTime = 0;

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  var dt = (timestamp - lastTime) / 1000;
  if (dt > 0.1) dt = 0.016;
  lastTime = timestamp;

  handleInput();

  if (!started) {
    drawTitleScreen();
    requestAnimationFrame(loop);
    return;
  }

  if (!paused && !gameOver && !levelComplete) {
    update(dt);
  } else if (levelComplete) {
    levelCompleteTimer += dt;
  }

  drawStore();
  drawItems();
  drawPlayer();
  drawShoppingList();
  drawHud();

  if (gameOver) drawGameOver();
  if (levelComplete) drawLevelComplete();

  requestAnimationFrame(loop);
}

startLevel();
started = false;
requestAnimationFrame(loop);
