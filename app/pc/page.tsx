"use client";

import { useRef, useState, useEffect } from "react";

// --- Physics config ---
const GRAVITY_SCALE = 2000; // How strongly tilt affects acceleration (pixels/s²)
const FRICTION = 0.985; // Velocity dampening per frame (0-1, higher = less friction)
const BOUNCE = 0.6; // Energy retained on wall bounce (0-1)
const DEADZONE = 1.5; // Degrees - ignore tiny movements
const POLL_INTERVAL = 1000 / 60; // 60 FPS polling
const BALL_RADIUS = 20;

// Low-pass filter for sensor smoothing
class LowPassFilter {
  private value = 0;
  private alpha: number;
  
  constructor(cutoffHz: number, sampleRate: number) {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    this.alpha = dt / (rc + dt);
  }
  
  filter(input: number): number {
    this.value += this.alpha * (input - this.value);
    return this.value;
  }
  
  reset(value: number) {
    this.value = value;
  }
}

// Soft deadzone with smooth transition
function applyDeadzone(value: number, deadzone: number): number {
  const absVal = Math.abs(value);
  if (absVal < deadzone) return 0;
  // Smooth transition from deadzone
  const sign = value > 0 ? 1 : -1;
  return sign * (absVal - deadzone) * (absVal / (absVal - deadzone * 0.5));
}

export default function PcPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayPitch, setDisplayPitch] = useState(0);
  const [displayRoll, setDisplayRoll] = useState(0);
  const [fire, setFire] = useState(0);
  const [connected, setConnected] = useState(false);

  // Physics state refs
  const ballX = useRef(0);
  const ballY = useRef(0);
  const velocityX = useRef(0);
  const velocityY = useRef(0);
  const lastTime = useRef(0);
  const initialized = useRef(false);
  
  // Sensor refs
  const rawPitch = useRef(0);
  const rawRoll = useRef(0);
  const fireRef = useRef(0);
  
  // Filters (initialized in useEffect)
  const pitchFilter = useRef<LowPassFilter | null>(null);
  const rollFilter = useRef<LowPassFilter | null>(null);

  // --- Poll sensor data from API ---
  useEffect(() => {
    // Initialize filters: 8Hz cutoff at 60Hz sample rate for smooth but responsive feel
    pitchFilter.current = new LowPassFilter(8, 60);
    rollFilter.current = new LowPassFilter(8, 60);
    
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/sensor");
        const data = await res.json();
        rawPitch.current = data.pitch;
        rawRoll.current = data.roll;
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

  // --- Canvas animation loop with physics ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      // Initialize ball position to center
      if (!initialized.current) {
        ballX.current = canvas!.width / 2;
        ballY.current = canvas!.height / 2;
        initialized.current = true;
      }
    }
    resize();
    window.addEventListener("resize", resize);
    lastTime.current = performance.now();

    function frame(currentTime: number) {
      const w = canvas!.width;
      const h = canvas!.height;
      
      // Calculate delta time in seconds (capped to avoid huge jumps)
      const dt = Math.min((currentTime - lastTime.current) / 1000, 0.05);
      lastTime.current = currentTime;

      // Clear canvas
      ctx!.fillStyle = "#111";
      ctx!.fillRect(0, 0, w, h);

      // Filter and apply deadzone to sensor values
      const filteredPitch = pitchFilter.current?.filter(rawPitch.current) ?? rawPitch.current;
      const filteredRoll = rollFilter.current?.filter(rawRoll.current) ?? rawRoll.current;
      
      const pitch = applyDeadzone(filteredPitch, DEADZONE);
      const roll = applyDeadzone(filteredRoll, DEADZONE);

      // Convert tilt angles to acceleration
      // Pitch: negative = tilt forward = ball goes up (negative Y acceleration)
      // Roll: positive = tilt right = ball goes right (positive X acceleration)
      const accelX = (roll / 45) * GRAVITY_SCALE; // Normalize to -1..1, then scale
      const accelY = (-pitch / 60) * GRAVITY_SCALE; // Inverted for natural feel

      // Apply acceleration to velocity (a = F/m, simplified: v += a * dt)
      velocityX.current += accelX * dt;
      velocityY.current += accelY * dt;

      // Apply friction (exponential decay)
      velocityX.current *= Math.pow(FRICTION, dt * 60);
      velocityY.current *= Math.pow(FRICTION, dt * 60);

      // Update position
      ballX.current += velocityX.current * dt;
      ballY.current += velocityY.current * dt;

      // Boundary collision with bounce
      const minX = BALL_RADIUS + 10;
      const maxX = w - BALL_RADIUS - 10;
      const minY = BALL_RADIUS + 60; // Account for HUD
      const maxY = h - BALL_RADIUS - 10;

      if (ballX.current < minX) {
        ballX.current = minX;
        velocityX.current = -velocityX.current * BOUNCE;
      } else if (ballX.current > maxX) {
        ballX.current = maxX;
        velocityX.current = -velocityX.current * BOUNCE;
      }

      if (ballY.current < minY) {
        ballY.current = minY;
        velocityY.current = -velocityY.current * BOUNCE;
      } else if (ballY.current > maxY) {
        ballY.current = maxY;
        velocityY.current = -velocityY.current * BOUNCE;
      }

      // Draw ball with motion blur effect
      const speed = Math.sqrt(velocityX.current ** 2 + velocityY.current ** 2);
      const glowSize = Math.min(speed / 100, 15);
      
      // Glow/trail based on speed
      if (speed > 50) {
        const gradient = ctx!.createRadialGradient(
          ballX.current, ballY.current, BALL_RADIUS,
          ballX.current, ballY.current, BALL_RADIUS + glowSize
        );
        gradient.addColorStop(0, fireRef.current ? "rgba(255,50,50,0.4)" : "rgba(50,255,100,0.4)");
        gradient.addColorStop(1, "transparent");
        ctx!.fillStyle = gradient;
        ctx!.beginPath();
        ctx!.arc(ballX.current, ballY.current, BALL_RADIUS + glowSize, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Main ball
      ctx!.beginPath();
      ctx!.arc(ballX.current, ballY.current, BALL_RADIUS, 0, Math.PI * 2);
      
      // Gradient fill for 3D effect
      const ballGradient = ctx!.createRadialGradient(
        ballX.current - BALL_RADIUS * 0.3, ballY.current - BALL_RADIUS * 0.3, BALL_RADIUS * 0.1,
        ballX.current, ballY.current, BALL_RADIUS
      );
      if (fireRef.current) {
        ballGradient.addColorStop(0, "#ff6666");
        ballGradient.addColorStop(1, "#cc0000");
      } else {
        ballGradient.addColorStop(0, "#66ff88");
        ballGradient.addColorStop(1, "#00aa33");
      }
      ctx!.fillStyle = ballGradient;
      ctx!.fill();

      // Fire pulse effect
      if (fireRef.current) {
        const pulseSize = BALL_RADIUS + 8 + Math.sin(currentTime / 50) * 4;
        ctx!.beginPath();
        ctx!.arc(ballX.current, ballY.current, pulseSize, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(255,50,50,${0.3 + Math.sin(currentTime / 50) * 0.2})`;
        ctx!.lineWidth = 3;
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
