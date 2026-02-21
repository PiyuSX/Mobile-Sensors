export interface SensorPacket {
  pitch: number;
  fire: 0 | 1;
}

export interface ServerWrappedPacket {
  type: "state";
  pitch: number;
  fire: 0 | 1;
}

export type IncomingMessage = SensorPacket | ServerWrappedPacket;

export function parseSensorMessage(data: string): SensorPacket | null {
  try {
    const msg: IncomingMessage = JSON.parse(data);
    // Server-wrapped format: {"type":"state","pitch":...,"fire":...}
    if ("type" in msg && msg.type === "state") {
      return { pitch: msg.pitch, fire: msg.fire };
    }
    // Direct format: {"pitch":...,"fire":...}
    if ("pitch" in msg && "fire" in msg) {
      return { pitch: msg.pitch, fire: msg.fire };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}
