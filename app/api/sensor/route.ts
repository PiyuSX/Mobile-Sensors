// Simple in-memory store for sensor data
// Works on Vercel Edge - data persists within the same instance

export const runtime = "edge";

interface SensorData {
  pitch: number;
  fire: number;
  timestamp: number;
}

// Global store (persists across requests within same edge instance)
const store: Map<string, SensorData> = new Map();

// Clean old data (older than 5 seconds)
function cleanOldData() {
  const now = Date.now();
  for (const [key, data] of store.entries()) {
    if (now - data.timestamp > 5000) {
      store.delete(key);
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const room = body.room || "default";
    
    store.set(room, {
      pitch: body.pitch ?? 0,
      fire: body.fire ?? 0,
      timestamp: Date.now(),
    });
    
    cleanOldData();
    
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid data" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const room = url.searchParams.get("room") || "default";
  
  const data = store.get(room);
  
  if (!data || Date.now() - data.timestamp > 2000) {
    // No recent data
    return new Response(JSON.stringify({ pitch: 0, fire: 0, connected: false }), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store",
      },
    });
  }
  
  return new Response(JSON.stringify({ 
    pitch: data.pitch, 
    fire: data.fire, 
    connected: true 
  }), {
    headers: { 
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
