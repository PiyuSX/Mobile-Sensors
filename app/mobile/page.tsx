"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useWebSocket, type ConnectionStatus } from "@/lib/useWebSocket";

// Extend window types for iOS permission APIs
interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}
interface DeviceMotionEventiOS extends DeviceMotionEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

function wrapAngle(a: number): number {
  // wrap to [-180, 180]
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const SEND_INTERVAL = 1000 / 30; // 30 FPS

export default function MobilePage() {
  const [url, setUrl] = useState("");
  const [pitch, setPitch] = useState(0);
  const [fire, setFire] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  const pitchRef = useRef(0);
  const fireRef = useRef(0);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { status, connect, disconnect, send } = useWebSocket();

  // --- Start sending loop when connected ---
  useEffect(() => {
    if (status === "connected") {
      sendTimerRef.current = setInterval(() => {
        send(
          JSON.stringify({
            pitch: Math.round(pitchRef.current * 10) / 10,
            fire: fireRef.current,
          })
        );
      }, SEND_INTERVAL);
    }
    return () => {
      if (sendTimerRef.current) {
        clearInterval(sendTimerRef.current);
        sendTimerRef.current = null;
      }
    };
  }, [status, send]);

  // --- Orientation listener ---
  useEffect(() => {
    if (!motionEnabled) return;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (e.beta == null) return;
      const wrapped = wrapAngle(e.beta);
      const clamped = clamp(wrapped, -60, 60);
      pitchRef.current = clamped;
      setPitch(clamped);
    }

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [motionEnabled]);

  // --- Touch -> fire ---
  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      // Don't capture touches on the top control bar
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
      // iOS 13+ requires explicit permission
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
    } catch (err) {
      // Not iOS or permission API not available -- orientation should still work
    }

    setMotionEnabled(true);
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="wss://your-server/ws"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex: "1 1 180px", minWidth: 160, padding: "8px 10px", borderRadius: 4, border: "1px solid #555", background: "#222", color: "#fff", fontSize: 14 }}
          />
          <button
            onClick={handleConnect}
            style={{ padding: "8px 18px", borderRadius: 4, border: "none", background: status === "connected" ? "#c33" : "#2a2", color: "#fff", cursor: "pointer", fontSize: 14 }}
          >
            {status === "connected" ? "Disconnect" : "Connect"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {!motionEnabled && (
            <button
              onClick={enableMotion}
              style={{ padding: "8px 18px", borderRadius: 4, border: "none", background: "#36a", color: "#fff", cursor: "pointer", fontSize: 14 }}
            >
              Enable Motion
            </button>
          )}
          <StatusBadge status={status} />
          <span style={{ fontSize: 13, color: "#aaa" }}>
            Pitch: <b style={{ color: "#fff" }}>{pitch.toFixed(1)}</b>
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

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const color = status === "connected" ? "#2a2" : status === "connecting" ? "#aa2" : "#666";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      {status}
    </span>
  );
}
