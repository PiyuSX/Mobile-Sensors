// Relay WebSocket server for Mobile Sensors
// Usage: node server.mjs
// Requires: npm install ws (already in devDependencies)

import { WebSocketServer } from "ws";

const PORT = 8787;
const PATH = "/ws";

const wss = new WebSocketServer({ port: PORT, path: PATH });

const clients = new Set();

wss.on("connection", (ws, req) => {
  const addr = req.socket.remoteAddress;
  console.log(`[+] Client connected from ${addr} (total: ${clients.size + 1})`);
  clients.add(ws);

  ws.on("message", (data) => {
    const msg = data.toString();
    // Broadcast to all OTHER clients
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(msg);
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[-] Client disconnected (total: ${clients.size})`);
  });

  ws.on("error", (err) => {
    console.error("WS error:", err.message);
    clients.delete(ws);
  });
});

console.log(`WebSocket relay server running on ws://localhost:${PORT}${PATH}`);
console.log(`Expose with ngrok: ngrok http ${PORT}`);
