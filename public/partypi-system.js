/**
 * PartyPi System Script (injected into EVERY page)
 *
 * This is a tiny, indestructible system-level script that ensures
 * core commands (navigate home, reload, pause overlay) ALWAYS work,
 * even if the game's own code is completely broken.
 *
 * DO NOT depend on any other script. This runs standalone.
 */
(function() {
  var ws, timer, retries = 0;
  var wsUrl = 'ws://' + location.host;
  var overlay = null;

  // ── Pause overlay (injected into DOM on first use) ──
  function getOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'partypi-system-pause';
    overlay.innerHTML =
      '<div style="text-align:center">' +
        '<div style="font-size:clamp(36px,5vw,72px);font-weight:700;margin-bottom:0.3em">Game Paused</div>' +
        '<div style="font-size:clamp(16px,2vw,28px);opacity:0.7">Use your controller to resume</div>' +
      '</div>';

    var s = overlay.style;
    s.position = 'fixed';
    s.inset = '0';
    s.zIndex = '999999';
    s.display = 'none';
    s.alignItems = 'center';
    s.justifyContent = 'center';
    s.background = 'rgba(12,10,26,0.92)';
    s.color = '#fff';
    s.fontFamily = 'Inter,system-ui,sans-serif';
    s.backdropFilter = 'blur(8px)';
    s.webkitBackdropFilter = 'blur(8px)';

    document.body.appendChild(overlay);
    return overlay;
  }

  function showPause() {
    var el = getOverlay();
    el.style.display = 'flex';
  }

  function hidePause() {
    if (overlay) overlay.style.display = 'none';
  }

  // ── WebSocket connection ──
  function connect() {
    try { ws = new WebSocket(wsUrl); } catch(e) { retry(); return; }

    ws.onopen = function() { retries = 0; };
    ws.onclose = function() { retry(); };
    ws.onerror = function() { try { ws.close(); } catch(e) {} };

    ws.onmessage = function(e) {
      try {
        var d = JSON.parse(e.data);

        // Navigate command — server tells TV to go somewhere
        if (d.type === 'navigate') {
          window.location.href = d.url || '/';
          return;
        }

        // Reload command
        if (d.type === 'reload') {
          window.location.reload();
          return;
        }

        // Pause overlay — works on every page, no game code needed
        if (d.type === 'pause_state') {
          if (d.paused) { showPause(); } else { hidePause(); }
          return;
        }
      } catch(e) {}
    };
  }

  function retry() {
    retries++;
    var delay = retries < 3 ? 1000 : retries < 6 ? 3000 : 8000;
    clearTimeout(timer);
    timer = setTimeout(connect, delay);
  }

  connect();
})();
