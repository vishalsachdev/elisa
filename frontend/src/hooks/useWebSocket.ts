import { useEffect, useRef, useCallback } from 'react';
import type { WSEvent } from '../types';

interface UseWebSocketOptions {
  sessionId: string | null;
  onEvent: (event: WSEvent) => void;
}

export function useWebSocket({ sessionId, onEvent }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/session/${sessionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      onEventRef.current({ type: 'session_started', session_id: sessionId });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        onEventRef.current(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    wsRef.current = ws;
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { connected: wsRef.current?.readyState === WebSocket.OPEN };
}
