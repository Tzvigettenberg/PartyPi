const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { exec } = require('child_process');

const app = express();

const server = http.createServer(app);
const secureServer = https.createServer(
  {
    key: fs.readFileSync(path.join(__dirname, 'certs', 'partypi-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'partypi-cert.pem'))
  },
  app
);

const wss = new WebSocket.Server({ server });
const secureWss = new WebSocket.Server({ server: secureServer });

const PLAY_CONTROLLER_URL = 'https://10.42.0.1:3443/controller.html';
const DEV_CONTROLLER_URL = 'https://192.168.1.20:3443/controller.html';
const PLAY_CONNECTION_NAME = 'PartyPiHotspot';
const DEV_CONNECTION_NAME = 'netplan-wlan0-HOTWiFi-DF89';

let lastPauseState = { type: 'pause_state', paused: false };

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/qr', async (req, res) => {
  try {
    const dataUrl = await QRCode.toDataURL(PLAY_CONTROLLER_URL, {
      width: 320,
      margin: 2
    });

    res.json({
      url: PLAY_CONTROLLER_URL,
      qr: dataUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/mode-status', (req, res) => {
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

app.get('/reload', (req, res) => {
  broadcastJSON({ type: 'reload' });
  res.send('Reload signal sent');
});

app.post('/switch-to-play', (req, res) => {
  res.send('Switching to Play Mode');
  exec('/home/pi/play-mode.sh');
});

app.post('/switch-to-dev', (req, res) => {
  res.send('Switching to Dev Mode');
  exec('/home/pi/dev-mode.sh');
});

function allClients() {
  return [...wss.clients, ...secureWss.clients];
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

function attachSocketHandler(socketServer) {
  socketServer.on('connection', (ws) => {
    ws.send(JSON.stringify(lastPauseState));

    ws.on('message', (message) => {
      const text = message.toString();

      try {
        const data = JSON.parse(text);

        if (data && data.type === 'pause_state') {
          lastPauseState = data;
        }
      } catch (err) {
        // ignore
      }

      broadcastRaw(text);
    });
  });
}

attachSocketHandler(wss);
attachSocketHandler(secureWss);

server.listen(3000, '0.0.0.0', () => {
  console.log('PartyPi HTTP running on port 3000');
});

secureServer.listen(3443, '0.0.0.0', () => {
  console.log('PartyPi HTTPS running on port 3443');
});
