const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ws = new WebSocket(`ws://${location.host}`);

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let lastActivityTime = Date.now();

let input = {
  pause: false
};

let previousInput = {
  pause: false
};

let paused = false;

let shoe = [];
let dealerHand = [];
let playerHand = [];

let balance = 100;
let bet = 10;
let phase = "betting";
let message = "Place your bet and deal.";
let dealerReveal = false;

function markActivity() {
  lastActivityTime = Date.now();
}

function createDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function ensureShoe() {
  if (shoe.length < 20) {
    shoe = [];
    for (let i = 0; i < 4; i++) shoe.push(...createDeck());
    shuffle(shoe);
  }
}

function drawCardFromShoe() {
  ensureShoe();
  return shoe.pop();
}

function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      total += 11;
      aces++;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function visibleDealerValue() {
  if (!dealerHand.length) return 0;
  if (dealerReveal) return handValue(dealerHand);

  const card = dealerHand[0];
  if (!card) return 0;
  if (card.rank === "A") return 11;
  if (["K", "Q", "J"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function resetRound() {
  dealerHand = [];
  playerHand = [];
  dealerReveal = false;
  phase = balance <= 0 ? "game_over" : "betting";
  message = phase === "game_over" ? "You are out of money." : "Place your bet and deal.";
}

function payoutBlackjack() {
  balance += Math.round(bet * 2.5);
}

function payoutWin() {
  balance += bet * 2;
}

function payoutPush() {
  balance += bet;
}

function sendPauseState() {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({
      type: 'pause_state',
      paused
    }));
  }
}

function sendBlackjackState() {
  if (ws.readyState !== 1) return;

  ws.send(JSON.stringify({
    type: "blackjack_state",
    balance,
    bet,
    phase,
    playerCards: playerHand.map(cardLabel),
    playerValue: handValue(playerHand),
    message,
    canBet: phase === "betting" && balance > 0,
    canDeal: phase === "betting" && balance >= bet && bet > 0,
    canHit: phase === "player_turn",
    canStand: phase === "player_turn",
    canDouble: phase === "player_turn" && playerHand.length === 2 && balance >= bet,
    canNewRound: phase === "round_over" || phase === "game_over"
  }));
}

function startDeal() {
  if (phase !== "betting") return;
  if (balance <= 0 || bet > balance) return;

  markActivity();

  balance -= bet;
  dealerHand = [drawCardFromShoe(), drawCardFromShoe()];
  playerHand = [drawCardFromShoe(), drawCardFromShoe()];
  dealerReveal = false;
  phase = "player_turn";
  message = "Your move.";

  const playerValue = handValue(playerHand);
  const dealerValue = handValue(dealerHand);

  if (playerValue === 21 && dealerValue === 21) {
    dealerReveal = true;
    payoutPush();
    phase = balance <= 0 ? "game_over" : "round_over";
    message = "Both have blackjack. Push.";
  } else if (playerValue === 21) {
    dealerReveal = true;
    payoutBlackjack();
    phase = "round_over";
    message = "Blackjack! You win 3:2.";
  } else if (dealerValue === 21) {
    dealerReveal = true;
    phase = balance <= 0 ? "game_over" : "round_over";
    message = "Dealer blackjack.";
  }

  if (balance <= 0 && phase === "round_over") phase = "game_over";
  sendBlackjackState();
}

function playerHit() {
  if (phase !== "player_turn") return;
  markActivity();

  playerHand.push(drawCardFromShoe());
  const value = handValue(playerHand);

  if (value > 21) {
    dealerReveal = true;
    phase = balance <= 0 ? "game_over" : "round_over";
    message = "Bust. Dealer wins.";
  } else {
    message = "Your move.";
  }

  sendBlackjackState();
}

function dealerPlayAndResolve() {
  dealerReveal = true;
  phase = "dealer_turn";

  while (handValue(dealerHand) < 17) {
    dealerHand.push(drawCardFromShoe());
  }

  const dealerValue = handValue(dealerHand);
  const playerValue = handValue(playerHand);

  if (dealerValue > 21) {
    payoutWin();
    message = "Dealer busts. You win.";
  } else if (playerValue > dealerValue) {
    payoutWin();
    message = "You win.";
  } else if (playerValue < dealerValue) {
    message = "Dealer wins.";
  } else {
    payoutPush();
    message = "Push.";
  }

  phase = balance <= 0 ? "game_over" : "round_over";
  sendBlackjackState();
}

function playerStand() {
  if (phase !== "player_turn") return;
  markActivity();
  dealerPlayAndResolve();
}

function playerDouble() {
  if (phase !== "player_turn") return;
  if (playerHand.length !== 2) return;
  if (balance < bet) return;

  markActivity();

  balance -= bet;
  bet *= 2;
  playerHand.push(drawCardFromShoe());

  if (handValue(playerHand) > 21) {
    dealerReveal = true;
    phase = balance <= 0 ? "game_over" : "round_over";
    message = "Bust after double.";
    sendBlackjackState();
    return;
  }

  dealerPlayAndResolve();
}

function adjustBet(dir) {
  if (phase !== "betting") return;
  markActivity();

  if (dir > 0) {
    bet = Math.min(balance, bet + 5);
  } else {
    bet = Math.max(5, bet - 5);
  }

  if (bet > balance && balance > 0) bet = balance;
  sendBlackjackState();
}

function newRound() {
  markActivity();

  if (balance <= 0) {
    phase = "game_over";
    message = "You are out of money.";
    sendBlackjackState();
    return;
  }

  if (bet > balance) bet = balance;
  if (bet < 5 && balance >= 5) bet = 5;

  resetRound();
  sendBlackjackState();
}

ws.onopen = () => {
  sendPauseState();
  sendBlackjackState();
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "blackjack_action") {
    if (data.action === "bet_down") adjustBet(-1);
    if (data.action === "bet_up") adjustBet(1);
    if (data.action === "deal") startDeal();
    if (data.action === "hit") playerHit();
    if (data.action === "stand") playerStand();
    if (data.action === "double") playerDouble();
    if (data.action === "new_round") newRound();
    return;
  }

  if (data.type === "pause_state") {
    paused = !!data.paused;
    sendPauseState();
    return;
  }

  if (data.type === "system_action") {
    if (data.action === "resume") {
      paused = false;
      markActivity();
      sendPauseState();
    }

    if (data.action === "return_home") {
      paused = false;
      sendPauseState();
      window.location.href = "/";
    }
    return;
  }

  if (data.type) return;

  input.pause = !!data.pause;
};

function handlePressedEvents() {
  const pausePressed = input.pause && !previousInput.pause;

  if (pausePressed) {
    paused = !paused;
    markActivity();
    sendPauseState();
  }

  previousInput.pause = input.pause;
}

function checkIdleTimeout() {
  if (!paused && Date.now() - lastActivityTime >= IDLE_TIMEOUT_MS) {
    paused = false;
    sendPauseState();
    window.location.href = "/";
  }
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#052e16");
  bg.addColorStop(1, "#022c22");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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

function drawTable() {
  ctx.fillStyle = "#0f5132";
  roundRect(120, 90, 1040, 540, 40);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 5;
  roundRect(120, 90, 1040, 540, 40);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(640, 585, 250, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawCard(x, y, label, hidden = false) {
  ctx.fillStyle = hidden ? "#1e293b" : "white";
  roundRect(x, y, 92, 126, 14);
  ctx.fill();

  ctx.strokeStyle = hidden ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  ctx.lineWidth = 3;
  roundRect(x, y, 92, 126, 14);
  ctx.stroke();

  if (hidden) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("?", x + 46, y + 74);
    ctx.textAlign = "left";
    return;
  }

  const isRed = label.includes("♥") || label.includes("♦");
  ctx.fillStyle = isRed ? "#b91c1c" : "#111827";
  ctx.font = "bold 28px Arial";
  ctx.fillText(label, x + 16, y + 40);

  ctx.font = "bold 18px Arial";
  ctx.fillText(label, x + 16, y + 104);
}

function drawHand(hand, startX, y, hideSecond = false) {
  for (let i = 0; i < hand.length; i++) {
    drawCard(startX + i * 104, y, cardLabel(hand[i]), hideSecond && i === 1);
  }
}

function drawHud() {
  ctx.fillStyle = "white";
  ctx.font = "bold 48px Arial";
  ctx.fillText("Blackjack", 40, 60);

  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(`Balance: $${balance}`, 40, 96);
  ctx.fillText(`Bet: $${bet}`, 40, 130);

  ctx.textAlign = "right";
  ctx.fillText("Phone shows your private hand and actions", canvas.width - 40, 60);
  ctx.textAlign = "left";
}

function drawDealerArea() {
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 30px Arial";
  ctx.fillText("Dealer", 160, 170);

  const dealerValueText = dealerReveal ? handValue(dealerHand) : visibleDealerValue();
  ctx.font = "22px Arial";
  ctx.fillText(`Value: ${dealerValueText}`, 160, 204);

  drawHand(dealerHand, 160, 230, !dealerReveal && dealerHand.length >= 2);
}

function drawPlayerArea() {
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 30px Arial";
  ctx.fillText("Player", 160, 420);

  ctx.font = "22px Arial";
  ctx.fillText(`Value: ${handValue(playerHand)}`, 160, 454);

  drawHand(playerHand, 160, 480, false);
}

function drawCenterMessage() {
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "bold 34px Arial";
  ctx.fillText(message, canvas.width / 2, 370);

  if (phase === "game_over") {
    ctx.fillStyle = "#f87171";
    ctx.font = "bold 28px Arial";
    ctx.fillText("Game Over", canvas.width / 2, 410);
  }

  ctx.textAlign = "left";
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "bold 52px Arial";
  ctx.fillText("Game Paused", canvas.width / 2, canvas.height / 2 - 10);

  ctx.font = "28px Arial";
  ctx.fillText("Resume on controller", canvas.width / 2, canvas.height / 2 + 36);
  ctx.textAlign = "left";
}

function loop() {
  handlePressedEvents();
  checkIdleTimeout();

  drawBackground();
  drawTable();
  drawHud();
  drawDealerArea();
  drawPlayerArea();
  drawCenterMessage();

  if (paused) {
    drawPauseOverlay();
  }

  requestAnimationFrame(loop);
}

ensureShoe();
resetRound();
loop();
