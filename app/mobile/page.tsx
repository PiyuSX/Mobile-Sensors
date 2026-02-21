"use client";

import { useRef, useState, useEffect, useCallback } from "react";

function wrapAngle(a: number): number {
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Complementary filter for smooth sensor fusion
class ComplementaryFilter {
  private value = 0;
  private alpha: number;
  
  constructor(alpha = 0.85) {
    this.alpha = alpha; // Higher = more trust in current reading
  }
  
  filter(gyroRate: number, accelAngle: number, dt: number): number {
    // Blend gyro integration with accelerometer angle
    this.value = this.alpha * (this.value + gyroRate * dt) + (1 - this.alpha) * accelAngle;
    return this.value;
  }
  
  setValue(v: number) {
    this.value = v;
  }
  
  getValue() {
    return this.value;
  }
}

// Simple low-pass filter for direct angle readings
class LowPassFilter {
  private value = 0;
  private alpha: number;
  
  constructor(smoothing = 0.3) {
    this.alpha = smoothing;
  }
  
  filter(input: number): number {
    this.value += this.alpha * (input - this.value);
    return this.value;
  }
}

const SEND_INTERVAL = 1000 / 60; // 60 FPS for smoother updates

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
  
  // Filters for smooth output
  const pitchFilter = useRef(new LowPassFilter(0.4));
  const rollFilter = useRef(new LowPassFilter(0.4));

  // --- Auto-send sensor data via POST ---
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await fetch("/api/sensor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pitch: Math.round(pitchRef.current * 100) / 100, // Higher precision
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

  // --- Orientation listener ---
  useEffect(() => {
    if (!motionEnabled) return;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (e.beta == null || e.gamma == null) return;
      
      // === GUN CONTROLLER PHYSICS ===
      // Phone held like a pistol in landscape mode:
      // - Power button side = TOP (like top of gun)
      // - Volume buttons = BOTTOM (like grip)
      // - Screen = front of gun (points at target)
      // - The dot on screen = crosshair/aim point
      //
      // PITCH (up/down aiming):
      // - Raise barrel (point gun at ceiling) → aim goes UP (+pitch)
      // - Lower barrel (point gun at floor) → aim goes DOWN (-pitch)
      // - Uses gamma: tilting top edge up = positive gamma
      //
      // ROLL (left/right aiming):
      // - Twist gun left (like turning steering wheel left) → aim goes LEFT (-roll)
      // - Twist gun right → aim goes RIGHT (+roll)
      // - Uses beta: adjusted for landscape orientation
      
      // Pitch: gamma directly maps to vertical aim
      const rawPitch = clamp(-e.gamma, -60, 60);
      
      // Roll: beta needs adjustment since phone is held ~horizontal
      // When phone is level facing forward, beta ≈ 90°
      // Subtract 90 to center it, then use for left/right
      const adjustedBeta = e.beta - 90;
      const rawRoll = clamp(adjustedBeta, -45, 45);
      
      // Smooth filtering for steady aim
      const pitchVal = pitchFilter.current.filter(rawPitch);
      const rollVal = rollFilter.current.filter(rawRoll);
      
      pitchRef.current = pitchVal;
      rollRef.current = rollVal;
      setPitch(pitchVal);
      setRoll(rollVal);
    }

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
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
