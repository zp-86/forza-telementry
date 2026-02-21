"use client";

import { useState, useEffect, useRef, useCallback } from 'react';

export type ConnectionState = "disconnected" | "server-only" | "game-active";

export function useTelemetry() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
    const lastDataTime = useRef<number>(0);
    const staleTimer = useRef<NodeJS.Timeout | undefined>(undefined);

    useEffect(() => {
        let ws: WebSocket;
        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            ws = new WebSocket('ws://localhost:5301');

            ws.onopen = () => {
                // WebSocket is connected to our telemetry server, but we don't know if the game is sending yet
                setConnectionState("server-only");
            };

            ws.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    lastDataTime.current = Date.now();

                    // If we got any packet (even paused), the game is connected
                    setConnectionState("game-active");
                    setData(parsed);

                    // Reset stale timer — if we don't hear back in 3s, game stopped
                    clearTimeout(staleTimer.current);
                    staleTimer.current = setTimeout(() => {
                        setConnectionState("server-only");
                    }, 3000);
                } catch (e) {
                    console.error("Telemetry parse error:", e);
                }
            };

            ws.onclose = () => {
                setConnectionState("disconnected");
                clearTimeout(staleTimer.current);
                reconnectTimer = setTimeout(connect, 3000);
            };

            ws.onerror = () => {
                ws.close();
            };
        };

        connect();

        return () => {
            clearTimeout(reconnectTimer);
            clearTimeout(staleTimer.current);
            if (ws) ws.close();
        };
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const injectData = useCallback((mockData: any) => {
        setData(mockData);
    }, []);

    return { data, connectionState, injectData };
}
