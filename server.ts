import express from 'express';
import path from 'path';
import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

interface ClientMetadata {
  role: 'client' | 'receiver';
  pin: string;
}

const clientMeta = new Map<WebSocket, ClientMetadata>();
const rooms = new Map<string, { clients: Set<WebSocket>; receivers: Set<WebSocket> }>();

// Helper to get or create a room
function getOrCreateRoom(pin: string) {
  if (!rooms.has(pin)) {
    rooms.set(pin, { clients: new Set(), receivers: new Set() });
  }
  return rooms.get(pin)!;
}

// Helper to remove a socket from its room
function removeFromRoom(ws: WebSocket) {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const room = rooms.get(meta.pin);
  if (room) {
    if (meta.role === 'client') {
      room.clients.delete(ws);
    } else {
      room.receivers.delete(ws);
    }

    // Print disconnection event to server console
    console.log(`[WebSocket] Room ${meta.pin} | ${meta.role === 'client' ? 'Smartphone client 📱' : 'PC receiver 💻'} disconnected.`);

    // Clean up empty rooms
    if (room.clients.size === 0 && room.receivers.size === 0) {
      rooms.delete(meta.pin);
    } else {
      // Notify other participants of disconnect
      const notification = JSON.stringify({
        type: 'peer-status',
        peerRole: meta.role,
        connected: false,
        clientCount: room.clients.size,
        receiverCount: room.receivers.size,
      });
      room.clients.forEach(c => { if (c !== ws && c.readyState === WebSocket.OPEN) c.send(notification); });
      room.receivers.forEach(r => { if (r !== ws && r.readyState === WebSocket.OPEN) r.send(notification); });
    }
  }
  clientMeta.delete(ws);
}

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        const { role, pin } = data;
        if (!pin || (role !== 'client' && role !== 'receiver')) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid join parameters' }));
          return;
        }

        // Clean up previous room if any
        removeFromRoom(ws);

        // Save new metadata
        clientMeta.set(ws, { role, pin });
        const room = getOrCreateRoom(pin);

        if (role === 'client') {
          room.clients.add(ws);
        } else {
          room.receivers.add(ws);
        }

        // Print connection event to server console
        console.log(`[WebSocket] Room ${pin} | ${role === 'client' ? 'Smartphone client 📱' : 'PC receiver 💻'} connected.`);

        // Send confirmation
        ws.send(JSON.stringify({
          type: 'joined',
          role,
          pin,
          clientCount: room.clients.size,
          receiverCount: room.receivers.size,
        }));

        // Broadcast peer-status to everyone in the room
        const statusMsg = JSON.stringify({
          type: 'peer-status',
          peerRole: role,
          connected: true,
          clientCount: room.clients.size,
          receiverCount: room.receivers.size,
        });

        room.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(statusMsg); });
        room.receivers.forEach(r => { if (r.readyState === WebSocket.OPEN) r.send(statusMsg); });
        return;
      }

      // Forward general events from clients to receivers in the same room
      const meta = clientMeta.get(ws);
      if (!meta) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not joined to any room' }));
        return;
      }

      const room = rooms.get(meta.pin);
      if (!room) return;

      // Broadcast client actions (mouse/key) to receivers
      if (meta.role === 'client') {
        // Output mouse click or keyboard input to the computer console (skip mouse-move to avoid telemetry clutter)
        if (data.type !== 'mouse-move' && data.type !== 'move') {
          console.log(`[Mouse/Keyboard Action] Room: ${meta.pin} | Type: ${data.type} | Detail:`, JSON.stringify(data));
        }

        const packet = JSON.stringify({
          ...data,
          senderId: 'client',
        });
        room.receivers.forEach(r => {
          if (r.readyState === WebSocket.OPEN) {
            r.send(packet);
          }
        });
      } else {
        // Broadcast receiver actions (status feedback) to clients
        const packet = JSON.stringify({
          ...data,
          senderId: 'receiver',
        });
        room.clients.forEach(c => {
          if (c.readyState === WebSocket.OPEN) {
            c.send(packet);
          }
        });
      }

    } catch (err) {
      console.error('WS Message Error:', err);
    }
  });

  ws.on('close', () => {
    removeFromRoom(ws);
  });

  ws.on('error', () => {
    removeFromRoom(ws);
  });
});

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size });
});

app.get('/api/ips', (req, res) => {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (netList) {
      for (const net of netList as any[]) {
        // Support Node 18+ family checking
        const family = typeof net.family === 'string' ? net.family : `IPv${net.family}`;
        if (family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
  }
  res.json({ ips });
});

// Setup Vite Dev Server / Static Hosting
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Wireless Touchpad backend running on http://localhost:${PORT}`);
  });
}

startServer();
