"use client";

import { useRef, useState, useEffect } from "react";

// --- Smoothing / deadzone config ---
const SMOOTHING = 0.15;
const DEADZONE = 2;
const POLL_INTERVAL = 1000 / 30; // 30 FPS

export default function PcPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);
  const [fire, setFire] = useState(0);
  const [connected, setConnected] = useState(false);

  const smoothedPitch = useRef(0);
  const smoothedRoll = useRef(0);
  const rawPitch = useRef(0);
  const rawRoll = useRef(0);
  const fireRef = useRef(0);

  // --- Poll sensor data from API ---
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/sensor");
        const data = await res.json();
        rawPitch.current = data.pitch;
        rawRoll.current = data.roll;
        fireRef.current = data.fire;
        setPitch(data.pitch);
        setRoll(data.roll);
        setFire(data.fire);
        setConnected(data.connected);
      } catch {
        setConnected(false);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, []);

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

      ctx!.fillStyle = "#111";
      ctx!.fillRect(0, 0, w, h);

      // Apply deadzone
      let targetPitch = rawPitch.current;
      let targetRoll = rawRoll.current;
      if (Math.abs(targetPitch) < DEADZONE) targetPitch = 0;
      if (Math.abs(targetRoll) < DEADZONE) targetRoll = 0;

      // Smooth the values
      smoothedPitch.current += SMOOTHING * (targetPitch - smoothedPitch.current);
      smoothedRoll.current += SMOOTHING * (targetRoll - smoothedRoll.current);

      // Tilt forward (negative pitch) = ball goes UP, tilt back = ball goes DOWN
      const clampedPitch = Math.max(-60, Math.min(60, smoothedPitch.current));
      const clampedRoll = Math.max(-45, Math.min(45, smoothedRoll.current));
      
      // Invert pitch: negative pitch (tilt forward) should move ball UP (smaller y)
      const normalisedY = (-clampedPitch + 60) / 120; // 0..1 (inverted)
      const normalisedX = (clampedRoll + 45) / 90; // 0..1
      
      const margin = 40;
      const y = margin + normalisedY * (h - 2 * margin);
      const x = margin + normalisedX * (w - 2 * margin);
      const radius = 18;

      ctx!.beginPath();
      ctx!.arc(x, y, radius, 0, Math.PI * 2);
      ctx!.fillStyle = fireRef.current ? "#ff2222" : "#22ff66";
      ctx!.fill();

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

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

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
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: connected ? "#2a2" : "#666" }} />
          {connected ? "Mobile Connected" : "Waiting for mobile..."}
        </span>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Pitch: <b style={{ color: "#fff" }}>{pitch.toFixed(1)}</b>
        </span>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Roll: <b style={{ color: "#fff" }}>{roll.toFixed(1)}</b>
        </span>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Fire: <b style={{ color: fire ? "#f44" : "#fff" }}>{fire}</b>
        </span>
      </div>
    </div>
  );
}
