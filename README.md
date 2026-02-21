# Mobile Sensors

Phone-to-PC sensor relay via WebSocket. Tilt your phone to control a dot on the PC screen; touch to fire.

## Project structure

```
app/
  layout.tsx        - Root layout
  page.tsx          - Home page with links to /pc and /mobile
  pc/page.tsx       - PC game page (canvas + WebSocket receiver)
  mobile/page.tsx   - Mobile controller (orientation + touch + WebSocket sender)
lib/
  types.ts          - Shared packet types and parser
  useWebSocket.ts   - Shared WebSocket hook
server.mjs          - Standalone WebSocket relay server (Node.js)
```

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/pc` on your PC browser and `http://localhost:3000/mobile` on your phone (they must be on the same network -- use your LAN IP).

**Note:** DeviceOrientation requires HTTPS on most browsers. For local testing, use the Cloudflare tunnel approach below, or use Chrome DevTools sensor emulation.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com), import the repo.
3. Vercel auto-detects Next.js. Click **Deploy**.
4. Your site will be at `https://your-project.vercel.app`.
   - PC page: `https://your-project.vercel.app/pc`
   - Mobile page: `https://your-project.vercel.app/mobile`

## Run the WebSocket relay server

The relay server is a simple Node.js script that broadcasts messages between connected clients. It is **not** deployed to Vercel -- you run it on your laptop.

```bash
# Install ws (already in devDependencies)
npm install

# Start the relay server on port 8787
npm run server
# or: node server.mjs
```

You should see:
```
WebSocket relay server running on ws://localhost:8787/ws
```

## Expose with Cloudflare Tunnel

To make the server accessible from the internet (required for phone -> laptop):

```bash
cloudflared tunnel --url http://localhost:8787
```

Cloudflare will print a URL like:
```
https://some-random-words.trycloudflare.com
```

The WebSocket URL to paste into both the PC and Mobile pages is:
```
wss://some-random-words.trycloudflare.com/ws
```

## Usage

1. Start the relay server and Cloudflare tunnel as described above.
2. Open `/pc` on your computer. Paste the `wss://...trycloudflare.com/ws` URL and click Connect.
3. Open `/mobile` on your phone. Paste the same URL and click Connect.
4. Tap **Enable Motion** on the phone (required on iOS for permission).
5. Tilt your phone forward/backward to move the dot up/down.
6. Touch and hold anywhere on the mobile screen to fire (dot turns red).

## Message format

The mobile page sends JSON at 30 FPS:

```json
{"pitch": 12.3, "fire": 0}
```

The PC page accepts both direct packets and server-wrapped packets:

```json
{"pitch": 12.3, "fire": 1}
{"type": "state", "pitch": 12.3, "fire": 1}
```
