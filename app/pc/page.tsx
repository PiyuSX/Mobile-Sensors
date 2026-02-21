"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useWebSocket, type ConnectionStatus } from "@/lib/useWebSocket";
import { parseSensorMessage } from "@/lib/types";

// --- Smoothing / deadzone config ---
const SMOOTHING = 0.15; // exponential smoothing factor (0..1, lower = smoother)
const DEADZONE = 2; // degrees; ignore small jitter

export default function PcPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [pitch, setPitch] = useState(0);
  const [fire, setFire] = useState(0);

  // Refs for animation loop (avoid stale closures)
  const smoothedPitch = useRef(0);
  const rawPitch = useRef(0);
  const fireRef = useRef(0);

  const onMessage = useCallback((data: string) => {
    const pkt = parseSensorMessage(data);
    if (!pkt) return;
    rawPitch.current = pkt.pitch;
    fireRef.current = pkt.fire;
    setPitch(pkt.pitch);
    setFire(pkt.fire);
  }, []);

  const { status, connect, disconnect } = useWebSocket(onMessage);

  // --- Canvas animation loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function frame() {
      const w = canvas!.width;
      const h = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      // Background
      ctx!.fillStyle = "#111";
      ctx!.fillRect(0, 0, w, h);

      // Apply deadzone
      let target = rawPitch.current;
      if (Math.abs(target) < DEADZONE) target = 0;

      // Exponential smoothing
      smoothedPitch.current += SMOOTHING * (target - smoothedPitch.current);

      // Map pitch [-60, 60] -> Y position
      // pitch negative = tilt forward = move up, pitch positive = tilt back = move down
      const clampedPitch = Math.max(-60, Math.min(60, smoothedPitch.current));
      const normalised = (clampedPitch + 60) / 120; // 0..1
      const margin = 40;
      const y = margin + normalised * (h - 2 * margin);

      const x = 80;
      const radius = 18;

      // Draw dot
      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fillStyle = fireRef.current ? "#ff2222" : "#22ff66";
      ctx!.fill();

      // Glow when firing
      if (fireRef.current) {
        ctx!.beginPath();
        ctx!.arc(x, y, radius + 8, 0, Math.PI * 2);
        ctx!.strokeStyle = "rgba(255,34,34,0.5)";
        ctx!.lineWidth = 4;
        ctx!.stroke();
      }

      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  function handleConnect() {
    if (status === "connected") {
      disconnect();
    } else {
      if (!url.startsWith("wss://")) {
        alert("URL must start with wss://");
        return;
      }
      connect(url);
    }
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {/* HUD overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(0,0,0,0.7)",
          flexWrap: "wrap",
          zIndex: 10,
        }}
      >
        <input
          type="text"
          placeholder="wss://your-server/ws"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: "1 1 240px", minWidth: 200, padding: "6px 10px", borderRadius: 4, border: "1px solid #555", background: "#222", color: "#fff", fontSize: 14 }}
        />
        <button
          onClick={handleConnect}
          style={{ padding: "6px 18px", borderRadius: 4, border: "none", background: status === "connected" ? "#c33" : "#2a2", color: "#fff", cursor: "pointer", fontSize: 14 }}
        >
          {status === "connected" ? "Disconnect" : "Connect"}
        </button>
        <StatusBadge status={status} />
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Pitch: <b style={{ color: "#fff" }}>{pitch.toFixed(1)}</b>
        </span>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Fire: <b style={{ color: fire ? "#f44" : "#fff" }}>{fire}</b>
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const color = status === "connected" ? "#2a2" : status === "connecting" ? "#aa2" : "#666";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      {status}
    </span>
  );
}
