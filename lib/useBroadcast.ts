"use client";

import { useRef, useEffect, useCallback, useState } from "react";

const CHANNEL_NAME = "mobile-sensors";

export function useBroadcast(onMessage?: (data: string) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    setConnected(true);

    if (onMessage) {
      channel.onmessage = (e) => onMessage(e.data as string);
    }

    return () => {
      channel.close();
      channelRef.current = null;
      setConnected(false);
    };
  }, [onMessage]);

  const send = useCallback((data: string) => {
    if (channelRef.current) {
      channelRef.current.postMessage(data);
    }
  }, []);

  return { connected, send };
}
