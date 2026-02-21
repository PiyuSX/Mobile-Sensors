"use client";

import { useRef, useState, useEffect } from "react";

// --- Config ---
const SENSITIVITY = 1.2; // Aim sensitivity multiplier
const POLL_INTERVAL = 1000 / 60; // 60 FPS polling
const CROSSHAIR_SIZE = 25;
const LERP_SPEED = 0.25; // Smoothing factor (0-1, higher = faster/more responsive)

export default function PcPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayPitch, setDisplayPitch] = useState(0);
  const [displayRoll, setDisplayRoll] = useState(0);
  const [fire, setFire] = useState(0);
  const [connected, setConnected] = useState(false);

  // Target aim position (from sensor)
  const targetX = useRef(0.5);
  const targetY = useRef(0.5);
  
  // Current smoothed aim position (for display)
  const currentX = useRef(0.5);
  const currentY = useRef(0.5);
  
  // Sensor refs
  const rawPitch = useRef(0);
  const rawRoll = useRef(0);
  const fireRef = useRef(0);
  const lastFireTime = useRef(0);

  // --- Poll sensor data from API ---
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/sensor");
        const data = await res.json();
        rawPitch.current = data.pitch;
        rawRoll.current = data.roll;
        
        // Detect new fire event
        if (data.fire && !fireRef.current) {
          lastFireTime.current = performance.now();
        }
        fireRef.current = data.fire;
        
        setDisplayPitch(data.pitch);
        setDisplayRoll(data.roll);
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

    function frame(currentTime: number) {
      const w = canvas!.width;
      const h = canvas!.height;

      // Clear canvas
      ctx!.fillStyle = "#0a0a0a";
      ctx!.fillRect(0, 0, w, h);
      
      // Calculate target position from sensor values
      // Roll (-50 to +50) → X (0 to 1)
      // Pitch (-60 to +60) → Y (0 to 1)
      const pitch = rawPitch.current;
      const roll = rawRoll.current;
      
      targetX.current = 0.5 + (roll / 50) * 0.45 * SENSITIVITY;
      targetY.current = 0.5 - (pitch / 60) * 0.45 * SENSITIVITY;
      
      // Clamp targets
      targetX.current = Math.max(0.03, Math.min(0.97, targetX.current));
      targetY.current = Math.max(0.06, Math.min(0.97, targetY.current));
      
      // Smooth interpolation (lerp) for buttery movement
      currentX.current += (targetX.current - currentX.current) * LERP_SPEED;
      currentY.current += (targetY.current - currentY.current) * LERP_SPEED;
      
      // Convert to pixel coordinates
      const crossX = currentX.current * w;
      const crossY = currentY.current * h;
      
      // Check if recently fired (for muzzle flash effect)
      const timeSinceFire = currentTime - lastFireTime.current;
      const showMuzzleFlash = timeSinceFire < 100;
      
      // Draw muzzle flash
      if (showMuzzleFlash) {
        const flashIntensity = 1 - (timeSinceFire / 100);
        const flashSize = 80 * flashIntensity;
        
        const gradient = ctx!.createRadialGradient(crossX, crossY, 0, crossX, crossY, flashSize);
        gradient.addColorStop(0, `rgba(255, 200, 50, ${flashIntensity * 0.8})`);
        gradient.addColorStop(0.3, `rgba(255, 100, 30, ${flashIntensity * 0.5})`);
        gradient.addColorStop(1, "transparent");
        ctx!.fillStyle = gradient;
        ctx!.fillRect(crossX - flashSize, crossY - flashSize, flashSize * 2, flashSize * 2);
      }
      
      // Draw crosshair
      const size = CROSSHAIR_SIZE;
      const gap = 8;
      const thickness = 3;
      
      // Color: red when firing, green otherwise
      const crossColor = fireRef.current ? "#ff3333" : "#33ff66";
      ctx!.strokeStyle = crossColor;
      ctx!.lineWidth = thickness;
      ctx!.lineCap = "round";
      
      // Crosshair lines (with gap in center)
      ctx!.beginPath();
      // Top
      ctx!.moveTo(crossX, crossY - gap);
      ctx!.lineTo(crossX, crossY - size);
      // Bottom
      ctx!.moveTo(crossX, crossY + gap);
      ctx!.lineTo(crossX, crossY + size);
      // Left
      ctx!.moveTo(crossX - gap, crossY);
      ctx!.lineTo(crossX - size, crossY);
      // Right
      ctx!.moveTo(crossX + gap, crossY);
      ctx!.lineTo(crossX + size, crossY);
      ctx!.stroke();
      
      // Center dot
      ctx!.beginPath();
      ctx!.arc(crossX, crossY, fireRef.current ? 4 : 3, 0, Math.PI * 2);
      ctx!.fillStyle = crossColor;
      ctx!.fill();
      
      // Outer ring when firing
      if (fireRef.current) {
        ctx!.beginPath();
        ctx!.arc(crossX, crossY, size + 5, 0, Math.PI * 2);
        ctx!.strokeStyle = "rgba(255, 50, 50, 0.6)";
        ctx!.lineWidth = 2;
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
          Pitch: <b style={{ color: "#fff" }}>{displayPitch.toFixed(1)}</b>
        </span>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Roll: <b style={{ color: "#fff" }}>{displayRoll.toFixed(1)}</b>
        </span>
        <span style={{ fontSize: 13, color: "#aaa" }}>
          Fire: <b style={{ color: fire ? "#f44" : "#fff" }}>{fire}</b>
        </span>
      </div>
    </div>
  );
}
