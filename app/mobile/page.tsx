"use client";

import { useRef, useState, useEffect, useCallback } from "react";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// One-Euro Filter - Professional smoothing with minimal latency
// Adapts smoothing based on speed: smooth when still, responsive when moving
class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastTime: number | null = null;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff; // Minimum cutoff frequency (smoothness when slow)
    this.beta = beta;           // Speed coefficient (responsiveness when fast)
    this.dCutoff = dCutoff;     // Derivative cutoff frequency
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp?: number): number {
    const now = timestamp ?? performance.now();
    
    if (this.x === null || this.lastTime === null) {
      this.x = value;
      this.lastTime = now;
      return value;
    }

    const dt = Math.max((now - this.lastTime) / 1000, 0.001); // seconds
    this.lastTime = now;

    // Estimate derivative
    const dx = (value - this.x) / dt;
    const edx = this.alpha(this.dCutoff, dt) * dx + (1 - this.alpha(this.dCutoff, dt)) * this.dx;
    this.dx = edx;

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    
    // Filter the value
    this.x = this.alpha(cutoff, dt) * value + (1 - this.alpha(cutoff, dt)) * this.x;
    return this.x;
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.lastTime = null;
  }
}

const SEND_INTERVAL = 1000 / 60; // 60 FPS

export default function MobilePage() {
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);
  const [fire, setFire] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  const pitchRef = useRef(0);
  const rollRef = useRef(0);
  const fireRef = useRef(0);
  
  // Gyro integration for left/right
  const yawAccumulator = useRef(0);
  const lastGyroTime = useRef(0);
  
  // One-Euro filters for buttery smooth output
  const pitchFilter = useRef(new OneEuroFilter(1.5, 0.01, 1.0));
  const yawFilter = useRef(new OneEuroFilter(2.0, 0.005, 1.0));

  // --- Auto-send sensor data via POST ---
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await fetch("/api/sensor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pitch: Math.round(pitchRef.current * 100) / 100,
            roll: Math.round(rollRef.current * 100) / 100,
            fire: fireRef.current,
          }),
        });
        setConnected(true);
      } catch {
        setConnected(false);
      }
    }, SEND_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  // --- Combined sensor handling for GUN CONTROLLER ---
  // Orientation: Phone bottom = barrel, screen facing sideways
  useEffect(() => {
    if (!motionEnabled) return;
    
    // Reset on enable
    yawAccumulator.current = 0;
    lastGyroTime.current = performance.now();
    pitchFilter.current.reset();
    yawFilter.current.reset();

    // === GYROSCOPE: Left/Right aiming (relative, like mouse) ===
    function handleMotion(e: DeviceMotionEvent) {
      if (!e.rotationRate) return;
      
      const now = performance.now();
      const dt = Math.max((now - lastGyroTime.current) / 1000, 0.001);
      lastGyroTime.current = now;
      
      // In this orientation (bottom forward, screen sideways):
      // rotationRate.gamma = rotation around phone's long axis (Y)
      // This captures when you rotate your wrist/arm left or right
      const yawRate = e.rotationRate.gamma ?? 0;
      
      // Integrate rotation rate (like mouse delta → position)
      // Sensitivity: degrees per second → accumulated degrees
      yawAccumulator.current += yawRate * dt;
      
      // Soft clamp with gradual resistance at edges
      const maxYaw = 50;
      if (Math.abs(yawAccumulator.current) > maxYaw) {
        yawAccumulator.current *= 0.98; // Gradual pullback
      }
      yawAccumulator.current = clamp(yawAccumulator.current, -maxYaw, maxYaw);
      
      // Apply One-Euro filter for smooth output
      const smoothYaw = yawFilter.current.filter(yawAccumulator.current, now);
      
      // Map to roll: positive yaw (turning right) = positive roll
      rollRef.current = smoothYaw;
      setRoll(smoothYaw);
    }

    // === ORIENTATION: Up/Down aiming (absolute angle) ===
    function handleOrientation(e: DeviceOrientationEvent) {
      if (e.beta == null) return;
      
      const now = performance.now();
      
      // In this orientation (bottom=barrel, screen=sideways):
      // BETA = forward/backward tilt of the barrel
      // When barrel points up → beta decreases (or increases depending on screen direction)
      // When barrel points down → beta changes opposite direction
      //
      // Neutral position: phone roughly horizontal, barrel pointing forward
      // beta ≈ 90° when phone is vertical screen-up, 0° when flat
      // When held gun-style with barrel forward, beta is around 80-100°
      
      // Center around 90° (horizontal forward), invert for natural feel
      // Barrel up (beta < 90) → positive pitch → aim up
      // Barrel down (beta > 90) → negative pitch → aim down
      const rawPitch = clamp(90 - e.beta, -60, 60);
      
      // Apply One-Euro filter
      const smoothPitch = pitchFilter.current.filter(rawPitch, now);
      
      pitchRef.current = smoothPitch;
      setPitch(smoothPitch);
    }

    window.addEventListener("devicemotion", handleMotion);
    window.addEventListener("deviceorientation", handleOrientation);
    
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [motionEnabled]);

  // --- Touch -> fire ---
  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("[data-controls]")) return;
      fireRef.current = 1;
      setFire(1);
    }
    function onTouchEnd() {
      fireRef.current = 0;
      setFire(0);
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // --- Request motion/orientation permission (iOS Safari) ---
  const enableMotion = useCallback(async () => {
    setPermissionError("");

    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };

      if (typeof DOE.requestPermission === "function") {
        const result = await DOE.requestPermission();
        if (result !== "granted") {
          setPermissionError("Orientation permission denied");
          return;
        }
      }
      if (typeof DME.requestPermission === "function") {
        const result = await DME.requestPermission();
        if (result !== "granted") {
          setPermissionError("Motion permission denied");
          return;
        }
      }
    } catch {
      // Not iOS or permission API not available
    }

    setMotionEnabled(true);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: fire ? "#300" : "#111",
        transition: "background 0.1s",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Control bar */}
      <div
        data-controls
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "rgba(0,0,0,0.8)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {!motionEnabled && (
            <button
              onClick={enableMotion}
              style={{ padding: "8px 18px", borderRadius: 4, border: "none", background: "#36a", color: "#fff", cursor: "pointer", fontSize: 14 }}
            >
              Enable Motion
            </button>
          )}
          {motionEnabled && (
            <button
              onClick={() => { yawAccumulator.current = 0; }}
              style={{ padding: "8px 18px", borderRadius: 4, border: "none", background: "#444", color: "#fff", cursor: "pointer", fontSize: 14 }}
            >
              Recenter
            </button>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: connected ? "#2a2" : "#666" }} />
            {connected ? "Sending" : "Connecting..."}
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
          {motionEnabled && <span style={{ fontSize: 12, color: "#4a4" }}>Motion active</span>}
          {permissionError && <span style={{ fontSize: 12, color: "#f44" }}>{permissionError}</span>}
        </div>
      </div>

      {/* Touch area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          color: "#555",
        }}
      >
        {fire ? "FIRING" : "Touch & hold to fire"}
      </div>
    </div>
  );
}
