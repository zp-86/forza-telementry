"use client";

import { useEffect, useRef, useState, useMemo } from 'react';

interface TelemetryPoint {
    d?: number;
    speed: number;
    brake?: number;
    accel?: number;
    steer?: number;
    gear?: number;
    rpm?: number;
}

export function LiveCharts({
    points
}: {
    points: TelemetryPoint[];
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 800, h: 400 });

    const [panX, setPanX] = useState(0);
    const [zoomX, setZoomX] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const lastMouseX = useRef(0);
    const [autoScroll, setAutoScroll] = useState(true);

    // Compute max distance
    const maxDist = useMemo(() => {
        if (!points || points.length === 0) return 1000;
        return points[points.length - 1].d || 1000;
    }, [points]);

    // Handle Resize
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDims({ w: Math.floor(width), h: Math.floor(height) });
                }
            }
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    // Draw Chart
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, dims.w, dims.h);

        // Layout constants
        const padding = { top: 20, bottom: 30, left: 60, right: 20 };
        const graphW = dims.w - padding.left - padding.right;
        const graphH = dims.h - padding.top - padding.bottom;

        // 3 chart rows for live view
        const rowH = graphH / 3;
        const row1Y = padding.top;
        const row2Y = padding.top + rowH;
        const row3Y = padding.top + rowH * 2;

        const effectiveZoom = Math.max(1, zoomX);
        const viewWDist = Math.max(500, maxDist / effectiveZoom); // Minimum 500m view width

        let viewStartDist = 0;
        if (autoScroll) {
            viewStartDist = Math.max(0, maxDist - viewWDist + 50); // Keep the head slightly before the right edge
        } else {
            viewStartDist = Math.max(0, Math.min(panX, maxDist - viewWDist));
        }

        // Background
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(padding.left, padding.top, graphW, graphH);

        // Grid lines (vertical)
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const distStep = viewWDist / 10;
        for (let i = 0; i <= 10; i++) {
            const d = viewStartDist + i * distStep;
            const x = padding.left + (i / 10) * graphW;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, dims.h - padding.bottom);
            ctx.stroke();
            ctx.fillText(`${(d / 1000).toFixed(2)}km`, x, dims.h - padding.bottom + 5);
        }

        // Horizontal dividers
        ctx.strokeStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(padding.left, row2Y); ctx.lineTo(dims.w - padding.right, row2Y);
        ctx.moveTo(padding.left, row3Y); ctx.lineTo(dims.w - padding.right, row3Y);
        ctx.stroke();

        // Row Labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Speed (mph)', padding.left - 5, row1Y + rowH / 2);
        ctx.fillText('Inputs (%)', padding.left - 5, row2Y + rowH / 2);
        ctx.fillText('Steer/RPM', padding.left - 5, row3Y + rowH / 2);

        // Helper to draw a generic trace
        const drawTrace = (
            pts: TelemetryPoint[],
            valSelector: (p: TelemetryPoint) => number,
            rowY: number,
            rowHeight: number,
            minVal: number,
            maxVal: number,
            color: string,
            lineWidth: number = 2
        ) => {
            if (!pts || pts.length === 0) return;
            ctx.beginPath();
            const range = maxVal - minVal || 1;
            let started = false;

            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                if (p.d === undefined) continue;
                if (p.d < viewStartDist) continue;
                if (p.d > viewStartDist + viewWDist) break;

                const x = padding.left + ((p.d - viewStartDist) / viewWDist) * graphW;
                const v = valSelector(p);
                const normalizedV = Math.max(0, Math.min(1, (v - minVal) / range));
                const y = rowY + rowHeight - (normalizedV * rowHeight);

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = 'round';
            ctx.stroke();
        };

        const drawFillTrace = (
            pts: TelemetryPoint[],
            valSelector: (p: TelemetryPoint) => number,
            rowY: number,
            rowHeight: number,
            minVal: number,
            maxVal: number,
            color: string
        ) => {
            if (!pts || pts.length === 0) return;
            ctx.beginPath();
            const range = maxVal - minVal || 1;
            let started = false;

            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                if (p.d === undefined) continue;
                if (p.d < viewStartDist) continue;
                if (p.d > viewStartDist + viewWDist) break;

                const x = padding.left + ((p.d - viewStartDist) / viewWDist) * graphW;
                const v = valSelector(p);
                const normalizedV = Math.max(0, Math.min(1, (v - minVal) / range));
                const y = rowY + rowHeight - (normalizedV * rowHeight);

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            if (started) {
                // Find where we end and begin within the view
                const visiblePts = pts.filter(p => p.d !== undefined && p.d >= viewStartDist && p.d <= viewStartDist + viewWDist);
                if (visiblePts.length > 0) {
                    const lastP = visiblePts[visiblePts.length - 1];
                    const firstP = visiblePts[0];
                    const lastX = padding.left + ((lastP.d! - viewStartDist) / viewWDist) * graphW;
                    const firstX = padding.left + ((firstP.d! - viewStartDist) / viewWDist) * graphW;

                    ctx.lineTo(Math.min(lastX, dims.w - padding.right), rowY + rowHeight);
                    ctx.lineTo(Math.max(firstX, padding.left), rowY + rowHeight);
                    ctx.fillStyle = color;
                    ctx.fill();
                }
            }
        };

        // --- Row 1: Speed ---
        // Find max speed in view for dynamic scaling, or just use 200
        let maxSpeed = 100;
        points.forEach(p => { if (p.speed > maxSpeed) maxSpeed = p.speed; });
        maxSpeed = Math.ceil(maxSpeed / 50) * 50; // round up to nearest 50
        drawTrace(points, p => p.speed, row1Y, rowH, 0, maxSpeed, '#3b82f6', 2);

        ctx.fillStyle = '#3b82f6';
        ctx.fillText(`0`, padding.left - 5, row1Y + rowH - 10);
        ctx.fillText(`${maxSpeed}`, padding.left - 5, row1Y + 10);

        // --- Row 2: Brake & Throttle ---
        // Brake (Red, fills from bottom)
        drawFillTrace(points, p => p.brake || 0, row2Y, rowH, 0, 255, 'rgba(239, 68, 68, 0.5)');
        drawTrace(points, p => p.brake || 0, row2Y, rowH, 0, 255, '#ef4444', 1.5);

        // Throttle (Green, fills from bottom)
        drawFillTrace(points, p => p.accel || 0, row2Y, rowH, 0, 255, 'rgba(34, 197, 94, 0.5)');
        drawTrace(points, p => p.accel || 0, row2Y, rowH, 0, 255, '#22c55e', 1.5);

        // --- Row 3: RPM & Steering ---
        // RPM in background (subtle purple)
        drawTrace(points, p => p.rpm || 0, row3Y, rowH, 0, 1, 'rgba(168, 85, 247, 0.5)', 1.5);

        // Steering (Yellow, centered)
        // Steer range is typically -127 to +127. Let's map -127 to 0, 0 to 0.5, 127 to 1
        const steerNorm = (p: TelemetryPoint) => {
            const s = p.steer || 0;
            return Math.max(-127, Math.min(127, s));
        };
        drawTrace(points, steerNorm, row3Y, rowH, -127, 127, '#facc15', 2);

        // Draw 0 line for steering
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(padding.left, row3Y + rowH / 2);
        ctx.lineTo(dims.w - padding.right, row3Y + rowH / 2);
        ctx.stroke();

    }, [points, dims, panX, zoomX, autoScroll, maxDist]);

    // Mouse events for panning
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsPanning(true);
        setAutoScroll(false); // Disable auto-scroll when user interacts
        lastMouseX.current = e.clientX;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - lastMouseX.current;
            lastMouseX.current = e.clientX;

            // Convert pixel delta to distance delta
            const padding = { left: 60, right: 20 };
            const graphW = dims.w - padding.left - padding.right;
            const effectiveZoom = Math.max(1, zoomX);
            const viewWDist = Math.max(500, maxDist / effectiveZoom);

            const distDx = (dx / graphW) * viewWDist;

            setPanX(prev => {
                const newPan = prev - distDx;
                return Math.max(0, Math.min(newPan, maxDist - viewWDist));
            });
        }
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setAutoScroll(false);
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoomX(prev => Math.max(1, Math.min(prev * zoomDelta, 50))); // max zoom 50x
    };

    return (
        <div className="w-full h-full flex flex-col relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden p-1">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button
                    onClick={() => setAutoScroll(true)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${autoScroll ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
                >
                    Auto-Scroll
                </button>
                <button
                    onClick={() => { setZoomX(1); setPanX(0); setAutoScroll(true); }}
                    className="px-3 py-1 text-xs font-bold rounded-md bg-neutral-800 text-neutral-400 hover:bg-neutral-700 transition-colors"
                >
                    Reset View
                </button>
            </div>

            {points.length === 0 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <span className="text-neutral-500 font-mono tracking-widest text-sm bg-neutral-900/80 px-4 py-2 rounded-lg">
                        Waiting for telemetry data...
                    </span>
                </div>
            )}

            <div
                ref={containerRef}
                className={`flex-1 w-full min-h-0 relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <canvas
                    ref={canvasRef}
                    width={dims.w}
                    height={dims.h}
                    className="absolute inset-0 w-full h-full"
                />
            </div>
        </div>
    );
}
