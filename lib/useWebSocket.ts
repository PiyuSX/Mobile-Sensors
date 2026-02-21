import { useRef, useState, useCallback } from "react";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export function useWebSocket(onMessage?: (data: string) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  const connect = useCallback(
    (url: string) => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (!url.startsWith("wss://")) {
        return;
      }

      setStatus("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setStatus("connected");

      ws.onclose = () => {
        setStatus("disconnected");
        wsRef.current = null;
      };

      ws.onerror = () => {
        setStatus("disconnected");
        ws.close();
        wsRef.current = null;
      };

      if (onMessage) {
        ws.onmessage = (e) => onMessage(e.data as string);
      }
    },
    [onMessage]
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const send = useCallback((data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { status, connect, disconnect, send };
}
