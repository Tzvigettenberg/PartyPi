/**
 * PartyPi Game SDK
 *
 * Include this script in any game page:
 *   <script src="/partypi-game.js"></script>
 *
 * It provides:
 *   - WebSocket connection with auto-reconnect
 *   - Event system for game input
 *   - partypi.on('input', fn)  — receive D-pad controller input
 *   - partypi.on('gyro', fn)   — receive gyro data
 *   - partypi.on('custom', fn) — receive custom game data
 *   - partypi.on('pause', fn)  — called when game is paused
 *   - partypi.on('resume', fn) — called when game is resumed
 *   - partypi.send(obj)        — send data to controller
 *   - partypi.isPaused()       — check pause state
 *
 * NOTE: Pause overlay and return-home are handled automatically by
 * partypi-system.js (injected into every page). This SDK just gives
 * game devs hooks to freeze/resume game logic.
 */

(function() {
  const wsUrl = `ws://${location.host}`;
  let ws;
  let reconnectTimer = null;
  let retryCount = 0;
  let paused = false;

  const listeners = {
    input: [],
    gyro: [],
    custom: [],
    pause: [],
    resume: []
  };

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      retryCount = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onclose = () => {
      retryCount++;
      const delay = retryCount < 3 ? 1000 : retryCount < 6 ? 2000 : 5000;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay);
      }
    };

    ws.onerror = () => { ws.close(); };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // These are handled by partypi-system.js — ignore here
      if (data.type === 'reload' || data.type === 'navigate') return;
      if (data.type === 'load_controls' || data.type === 'client_count') return;

      // Pause state — system script shows the overlay,
      // but we emit events so game devs can freeze/resume logic
      if (data.type === 'pause_state') {
        paused = !!data.paused;
        emit(paused ? 'pause' : 'resume', data);
        return;
      }

      // System action: resume
      if (data.type === 'system_action') {
        if (data.action === 'resume') {
          paused = false;
          emit('resume', data);
        }
        return;
      }

      // Gyro data
      if (data.type === 'gyro') {
        emit('gyro', data);
        return;
      }

      // Custom game data (any typed message not handled above)
      if (data.type) {
        emit('custom', data);
        return;
      }

      // Raw D-pad input (no type field, just button states)
      emit('input', data);
    };
  }

  function emit(event, data) {
    if (listeners[event]) {
      listeners[event].forEach(fn => fn(data));
    }
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // ── Public API ──
  window.partypi = window.partypi || {};
  window.partypi.on = function(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  };
  window.partypi.send = send;
  window.partypi.isPaused = () => paused;

  connect();
})();
