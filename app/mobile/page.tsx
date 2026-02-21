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
  
  // Reference alpha (compass heading) when motion started - for relative left/right
  const alphaRef = useRef<number | null>(null);
  
  // Filters for smooth output
  const pitchFilter = useRef(new LowPassFilter(0.5));
  const rollFilter = useRef(new LowPassFilter(0.5));

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
    
    // Reset reference when enabling
    alphaRef.current = null;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      
      // === GUN CONTROLLER - LANDSCAPE MODE ===
      // Phone held like a pistol:
      // - Power button UP, Volume buttons DOWN
      // - Screen visible to user, back camera points at target
      //
      // LEFT/RIGHT AIMING (roll): Use ALPHA (compass heading)
      // - Turn your hand/body left → crosshair moves left
      // - Turn your hand/body right → crosshair moves right
      // - Much more natural than twisting the phone!
      //
      // UP/DOWN AIMING (pitch): Use BETA (tilt forward/back)
      // - Tilt barrel up (point at ceiling) → crosshair moves up
      // - Tilt barrel down (point at floor) → crosshair moves down
      
      // Set initial alpha as center reference
      if (alphaRef.current === null) {
        alphaRef.current = e.alpha;
      }
      
      // ROLL: Relative compass heading (left/right aim)
      // Calculate difference from starting position
      let deltaAlpha = e.alpha - alphaRef.current;
      // Wrap around 360° boundary
      if (deltaAlpha > 180) deltaAlpha -= 360;
      if (deltaAlpha < -180) deltaAlpha += 360;
      const rawRoll = clamp(-deltaAlpha, -45, 45); // Invert so turning right = positive
      
      // PITCH: Beta tells how much phone is tilted forward/back
      // When holding gun style, beta around 45-90° is "level"
      // Tilt up = lower beta, Tilt down = higher beta
      const rawPitch = clamp(-(e.beta - 60), -60, 60); // Center around 60°, invert for natural feel
      
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
