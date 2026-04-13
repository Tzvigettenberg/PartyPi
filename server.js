const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { exec } = require('child_process');
const os = require('os');

const app = express();

// Detect if we're on the Pi or a dev machine
const certPath = path.join(__dirname, 'certs', 'partypi-key.pem');
const certExists = fs.existsSync(certPath);
const isPi = certExists && os.platform() === 'linux' && os.arch() === 'arm64';

// HTTP server (always runs)
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// HTTPS server (only on Pi with certs)
let secureServer = null;
let secureWss = null;

if (certExists) {
  try {
    secureServer = https.createServer(
      {
        key: fs.readFileSync(path.join(__dirname, 'certs', 'partypi-key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'partypi-cert.pem'))
      },
      app
    );
    secureWss = new WebSocket.Server({ server: secureServer });
  } catch (err) {
    console.log('Could not start HTTPS server:', err.message);
  }
}

// Figure out the right controller URL
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const PLAY_CONTROLLER_URL = isPi
  ? 'https://10.42.0.1:3443/controller.html'
  : `http://${getLocalIP()}:3000/controller.html`;

const DEV_CONTROLLER_URL = isPi
  ? 'https://192.168.1.20:3443/controller.html'
  : `http://localhost:3000/controller.html`;

const PLAY_CONNECTION_NAME = 'PartyPiHotspot';
const DEV_CONNECTION_NAME = 'netplan-wlan0-HOTWiFi-DF89';

let lastPauseState = { type: 'pause_state', paused: false };

app.use(express.json());

// ── Inject partypi-system.js into every HTML page ──
// This ensures navigate/reload commands ALWAYS work, even if game code is broken.
app.use((req, res, next) => {
  // Only intercept .html files and the root path
  if (req.path === '/' || req.path.endsWith('.html')) {
    const filePath = req.path === '/'
      ? path.join(__dirname, 'public', 'index.html')
      : path.join(__dirname, 'public', req.path);

    if (fs.existsSync(filePath)) {
      let html = fs.readFileSync(filePath, 'utf8');

      // Only inject into game pages (under /games/)
      // Home page has its own WebSocket, controller has its own, etc.
      if (req.path.startsWith('/games/')) {
        const systemScript = '<script src="/partypi-system.js"></script>';
        // Inject before </body> or at end of file
        if (html.includes('</body>')) {
          html = html.replace('</body>', systemScript + '\n</body>');
        } else {
          html += '\n' + systemScript;
        }
      }

      res.type('html').send(html);
      return;
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/qr', async (req, res) => {
  try {
    const controllerUrl = isPi ? PLAY_CONTROLLER_URL : `http://${getLocalIP()}:3000/controller.html`;
    const dataUrl = await QRCode.toDataURL(controllerUrl, {
      width: 320,
      margin: 2
    });

    res.json({
      url: controllerUrl,
      qr: dataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/mode-status', (req, res) => {
  if (!isPi) {
    // Mock response for local dev
    return res.json({
      mode: 'dev',
      controllerUrl: DEV_CONTROLLER_URL,
      activeConnections: ['Local Dev Mode']
    });
  }

  exec('nmcli -t -f NAME connection show --active', (err, stdout) => {
    const activeNames = (stdout || '')
      .split('\n')
      .map(name => name.trim())
      .filter(Boolean);

    let mode = 'unknown';
    let controllerUrl = PLAY_CONTROLLER_URL;

    if (activeNames.includes(PLAY_CONNECTION_NAME)) {
      mode = 'play';
      controllerUrl = PLAY_CONTROLLER_URL;
    } else if (activeNames.includes(DEV_CONNECTION_NAME)) {
      mode = 'dev';
      controllerUrl = DEV_CONTROLLER_URL;
    }

    res.json({
      mode,
      controllerUrl,
      activeConnections: activeNames
    });
  });
});

app.get('/games-list', (req, res) => {
  try {
    const gamesDir = path.join(__dirname, 'public', 'games');

    if (!fs.existsSync(gamesDir)) {
      return res.json([]);
    }

    const entries = fs.readdirSync(gamesDir, { withFileTypes: true });
    const games = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(gamesDir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        if (manifest && manifest.name && manifest.entry) {
          games.push({
            id: manifest.id || entry.name,
            name: manifest.name,
            description: manifest.description || '',
            controls: manifest.controls || 'unknown',
            entry: manifest.entry,
            controllerEntry: manifest.controllerEntry || null
          });
        }
      } catch (err) {
        console.log(`Skipping invalid manifest: ${manifestPath}`);
      }
    }

    res.json(games);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load games list' });
  }
});

// Returns the controller URL for a given game
app.get('/game-controller/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  const manifestPath = path.join(__dirname, 'public', 'games', gameId, 'manifest.json');

  try {
    if (!fs.existsSync(manifestPath)) {
      return res.json({ url: '/controls/dpad.html', id: 'dpad' });
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    if (manifest.controllerEntry) {
      // Game has its own full custom controller fragment
      return res.json({ url: manifest.controllerEntry, id: gameId });
    }

    if (manifest.controllerPreset === 'gyro') {
      return res.json({ url: '/controls/gyro.html', id: 'gyro' });
    }

    // Default to dpad
    return res.json({ url: '/controls/dpad.html', id: 'dpad' });
  } catch (err) {
    return res.json({ url: '/controls/dpad.html', id: 'dpad' });
  }
});

app.get('/reload', (req, res) => {
  broadcastJSON({ type: 'reload' });
  res.send('Reload signal sent');
});

app.post('/switch-to-play', (req, res) => {
  if (!isPi) {
    return res.send('Mock: Switching to Play Mode');
  }
  res.send('Switching to Play Mode');
  exec('/home/pi/play-mode.sh');
});

app.post('/switch-to-dev', (req, res) => {
  if (!isPi) {
    return res.send('Mock: Switching to Dev Mode');
  }
  res.send('Switching to Dev Mode');
  exec('/home/pi/dev-mode.sh');
});

function allClients() {
  const clients = [...wss.clients];
  if (secureWss) {
    clients.push(...secureWss.clients);
  }
  return clients;
}

function broadcastRaw(text) {
  for (const client of allClients()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

function broadcastJSON(obj) {
  broadcastRaw(JSON.stringify(obj));
}

function getClientCount() {
  return allClients().filter(c => c.readyState === WebSocket.OPEN).length;
}

function broadcastClientCount() {
  broadcastJSON({ type: 'client_count', count: getClientCount() });
}

function attachSocketHandler(socketServer) {
  socketServer.on('connection', (ws) => {
    ws.send(JSON.stringify(lastPauseState));

    // Let everyone know a new client connected
    setTimeout(broadcastClientCount, 100);

    ws.on('message', (message) => {
      const text = message.toString();

      try {
        const data = JSON.parse(text);

        if (data && data.type === 'pause_state') {
          lastPauseState = data;
        }

        // ── Server-side return home handling ──
        // When any client sends return_home, the SERVER broadcasts
        // a navigate command. This works even if the game page is broken
        // because partypi-system.js (injected into every page) handles it.
        if (data && data.type === 'system_action' && data.action === 'return_home') {
          lastPauseState = { type: 'pause_state', paused: false };
          broadcastJSON({ type: 'navigate', url: '/' });
          broadcastJSON({ type: 'load_controls', url: '/controls/dpad.html', id: 'dpad' });
          broadcastJSON({ type: 'pause_state', paused: false });
          return;
        }

        // ── Server-side resume handling ──
        // Convert resume action into pause_state:false so the system script
        // (which only listens for pause_state) hides the overlay.
        if (data && data.type === 'system_action' && data.action === 'resume') {
          lastPauseState = { type: 'pause_state', paused: false };
          broadcastJSON({ type: 'pause_state', paused: false });
          return;
        }
      } catch (err) {
        // ignore
      }

      broadcastRaw(text);
    });

    ws.on('close', () => {
      setTimeout(broadcastClientCount, 100);
    });
  });
}

attachSocketHandler(wss);
if (secureWss) {
  attachSocketHandler(secureWss);
}

// ── Heartbeat ping every 5 seconds ──
// iOS Safari kills WebSockets silently when backgrounded.
// This ping lets clients detect when the connection is dead.
setInterval(() => {
  broadcastJSON({ type: 'ping', t: Date.now() });
}, 5000);

server.listen(3000, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`PartyPi HTTP running on port 3000`);
  if (!isPi) {
    console.log(`\n  TV screen:   http://localhost:3000`);
    console.log(`  Controller:  http://localhost:3000/controller.html`);
    console.log(`  From phone:  http://${ip}:3000/controller.html\n`);
  }
});

if (secureServer) {
  secureServer.listen(3443, '0.0.0.0', () => {
    console.log('PartyPi HTTPS running on port 3443');
  });
}
