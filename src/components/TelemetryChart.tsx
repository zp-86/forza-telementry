"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { LapData } from '@/hooks/useLapManager';

interface TelemetryPoint {
    d?: number;
    speed: number;
    brake?: number;
    accel?: number;
    steer?: number;
    gear?: number;
    rpm?: number;
}

export function TelemetryChart({
    baseLap,
    compLap,
    syncDistance,
    onHover,
}: {
    baseLap?: LapData;
    compLap: LapData;
    syncDistance?: number | null;
    onHover?: (distance: number | null) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 800, h: 400 });

    // Top: Speed
    // 2nd: Delta Time (if baseLap present)
    // 3rd: Brake & Throttle
    // Bottom: Steering & Gear

    const [panX, setPanX] = useState(0);
    const [zoomX, setZoomX] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const lastMouseX = useRef(0);
    const [hoverDist, setHoverDist] = useState<number | null>(null);

    // Compute max distance
    const maxDist = useMemo(() => {
        let md = 0;
        if (compLap.points && compLap.points.length > 0) {
            md = Math.max(md, compLap.points[compLap.points.length - 1].d || 0);
        }
        if (baseLap?.points && baseLap.points.length > 0) {
            md = Math.max(md, baseLap.points[baseLap.points.length - 1].d || 0);
        }
        return md || 1000;
    }, [baseLap, compLap]);

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

        // 4 chart rows
        const rowH = graphH / 4;
        const row1Y = padding.top;
        const row2Y = padding.top + rowH;
        const row3Y = padding.top + rowH * 2;
        const row4Y = padding.top + rowH * 3;

        const effectiveZoom = Math.max(1, zoomX);
        const viewWDist = maxDist / effectiveZoom;
        const viewStartDist = Math.max(0, Math.min(panX, maxDist - viewWDist));

        // Background lines and labels
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
        ctx.moveTo(padding.left, row4Y); ctx.lineTo(dims.w - padding.right, row4Y);
        ctx.stroke();

        // Row Labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Speed (mph)', padding.left - 5, row1Y + rowH / 2);
        ctx.fillText('Delta (+/-)', padding.left - 5, row2Y + rowH / 2);
        ctx.fillText('Inputs (%)', padding.left - 5, row3Y + rowH / 2);
        ctx.fillText('Gear/Steer', padding.left - 5, row4Y + rowH / 2);

        // Helper to draw a generic trace
        const drawTrace = (
            points: TelemetryPoint[],
            valSelector: (p: TelemetryPoint) => number,
            rowY: number,
            rowHeight: number,
            minVal: number,
            maxVal: number,
            color: string,
            lineWidth: number = 2,
            isFill: boolean = false
        ) => {
            if (!points || points.length === 0) return;
            ctx.beginPath();
            const range = maxVal - minVal || 1;
            let started = false;

            for (let i = 0; i < points.length; i++) {
                const p = points[i];
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

            if (isFill && started) {
                const lastP = points[points.length - 1];
                const lastX = padding.left + ((lastP.d! - viewStartDist) / viewWDist) * graphW;
                const firstP = points[0];
                const firstX = padding.left + ((firstP.d! - viewStartDist) / viewWDist) * graphW;
                ctx.lineTo(Math.min(lastX, dims.w - padding.right), rowY + rowHeight);
                ctx.lineTo(Math.max(firstX, padding.left), rowY + rowHeight);
                ctx.fillStyle = color;
                ctx.fill();
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
        };

        // Determine min/max for speed
        let maxSpeed = 10;
        const allPts = [...(baseLap?.points || []), ...compLap.points];
        allPts.forEach(p => { if (p.speed > maxSpeed) maxSpeed = p.speed; });
        maxSpeed = Math.ceil(maxSpeed / 10) * 10; // Round up to nearest 10

        // Calculate Max Delta scale
        let maxDelta = 1;
        const deltaPoints: { d: number, delta: number }[] = [];
        if (baseLap) {
            // Build an interpolation table for baseLap times by distance
            let bIdx = 0;
            compLap.points.forEach(cp => {
                if (cp.d === undefined) return;
                // find nearest baseLap time for this distance
                while (bIdx < baseLap.points.length - 1 && (baseLap.points[bIdx + 1].d || 0) < cp.d) {
                    bIdx++;
                }
                const bp = baseLap.points[bIdx];
                if (bp && bp.d !== undefined) {
                    const delta = cp.time - bp.time; // (+) means compLap is slower, (-) means faster
                    deltaPoints.push({ d: cp.d, delta });
                    if (Math.abs(delta) > maxDelta) maxDelta = Math.abs(delta);
                }
            });
            maxDelta = Math.ceil(maxDelta * 2) / 2; // snap to 0.5s increments
        }

        // Draw Reference Lap (Base)
        if (baseLap) {
            drawTrace(baseLap.points, p => p.speed, row1Y, rowH, 0, maxSpeed, 'rgba(16, 185, 129, 0.5)', 2);
            drawTrace(baseLap.points, p => (p.accel || 0) / 2.55, row3Y, rowH, 0, 100, 'rgba(16, 185, 129, 0.2)', 0, true);
            drawTrace(baseLap.points, p => (p.brake || 0) / 2.55, row3Y, rowH, 0, 100, 'rgba(239, 68, 68, 0.2)', 0, true);
            drawTrace(baseLap.points, p => p.gear || 0, row4Y, rowH, 0, 10, 'rgba(16, 185, 129, 0.3)', 2);
        }

        // Draw Comparison Lap
        // Speed
        drawTrace(compLap.points, p => p.speed, row1Y, rowH, 0, maxSpeed, 'rgba(59, 130, 246, 1)', 2);

        // Delta Time Trace
        if (baseLap && deltaPoints.length > 0) {
            // Draw 0 line
            ctx.strokeStyle = '#666';
            ctx.beginPath();
            ctx.moveTo(padding.left, row2Y + rowH / 2);
            ctx.lineTo(dims.w - padding.right, row2Y + rowH / 2);
            ctx.stroke();

            // Custom draw for Delta trace since colors change based on +/-
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < deltaPoints.length; i++) {
                const p = deltaPoints[i];
                if (p.d < viewStartDist) continue;
                if (p.d > viewStartDist + viewWDist) break;

                const x = padding.left + ((p.d - viewStartDist) / viewWDist) * graphW;

                // Y map: -maxDelta is bottom, +maxDelta is top. 
                // Wait, if compLap is SLOWER (+), we want it to go UP (worse time)
                // So +delta goes to top of row. 0 is middle. -delta goes to bottom.
                const normalizedV = (p.delta - (-maxDelta)) / (maxDelta * 2);
                const y = row2Y + rowH - (normalizedV * rowH);

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            if (started) {
                // A split gradient looks awesome for delta time (Red top, Green bottom)
                const grad = ctx.createLinearGradient(0, row2Y, 0, row2Y + rowH);
                grad.addColorStop(0, '#ef4444'); // Red for positive (slower)
                grad.addColorStop(0.5, '#666666');
                grad.addColorStop(1, '#22c55e'); // Green for negative (faster)

                ctx.strokeStyle = grad;
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }

        // Inputs
        drawTrace(compLap.points, p => (p.accel || 0) / 2.55, row3Y, rowH, 0, 100, 'rgba(34, 197, 94, 0.8)', 2); // Green Throttle
        drawTrace(compLap.points, p => (p.brake || 0) / 2.55, row3Y, rowH, 0, 100, 'rgba(239, 68, 68, 0.8)', 2); // Red Brake

        // Steer & Gear
        drawTrace(compLap.points, p => p.gear || 0, row4Y, rowH, 0, 10, 'rgba(251, 191, 36, 0.8)', 2); // Amber Gear
        drawTrace(compLap.points, p => (p.steer || 0), row4Y, rowH, -127, 127, 'rgba(168, 85, 247, 0.8)', 1); // Purple steer

        // Hover Scrubber
        const drawScrubber = (dist: number, color: string) => {
            if (dist < viewStartDist || dist > viewStartDist + viewWDist) return;
            const x = padding.left + ((dist - viewStartDist) / viewWDist) * graphW;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, dims.h - padding.bottom);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        };

        if (hoverDist !== null) {
            drawScrubber(hoverDist, 'rgba(255, 255, 255, 0.8)');
        }
        if (syncDistance !== undefined && syncDistance !== null) {
            drawScrubber(syncDistance, 'rgba(251, 191, 36, 0.8)');
        }

    }, [dims, baseLap, compLap, panX, zoomX, maxDist, hoverDist, syncDistance]);

    // Interactions
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoomX(prev => Math.max(1, Math.min(prev * zoomDelta, 20)));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setIsPanning(true);
        lastMouseX.current = e.clientX;
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const paddingLeft = 60;
        const paddingRight = 20;
        const graphW = dims.w - paddingLeft - paddingRight;

        if (isPanning) {
            const dx = e.clientX - lastMouseX.current;
            const effectiveZoom = Math.max(1, zoomX);
            const viewWDist = maxDist / effectiveZoom;

            // Convert pixel dx to distance dx
            const distDx = (dx / graphW) * viewWDist;

            setPanX(prev => Math.max(0, Math.min(prev - distDx, maxDist - viewWDist)));
            lastMouseX.current = e.clientX;
            return;
        }

        // Hover
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const x = e.clientX - rect.left;
            if (x >= paddingLeft && x <= dims.w - paddingRight) {
                const effectiveZoom = Math.max(1, zoomX);
                const viewWDist = maxDist / effectiveZoom;
                const viewStartDist = Math.max(0, Math.min(panX, maxDist - viewWDist));

                const dist = viewStartDist + ((x - paddingLeft) / graphW) * viewWDist;
                setHoverDist(dist);
                if (onHover) onHover(dist);
            } else {
                setHoverDist(null);
                if (onHover) onHover(null);
            }
        }
    }, [isPanning, dims.w, zoomX, maxDist, panX, onHover]);

    const handleMouseUp = useCallback(() => setIsPanning(false), []);
    const handleMouseLeave = useCallback(() => {
        setIsPanning(false);
        setHoverDist(null);
        if (onHover) onHover(null);
    }, [onHover]);

    // Legend data
    const getPointAtDist = (points: TelemetryPoint[], dist: number) => {
        if (!points || points.length === 0) return null;
        let closest = points[0];
        let minDist = Math.abs((closest.d || 0) - dist);
        for (let i = 1; i < points.length; i++) {
            const d = Math.abs((points[i].d || 0) - dist);
            if (d < minDist) {
                minDist = d;
                closest = points[i];
            } else if (d > minDist) { // since it's sorted, we can break early when distance starts increasing
                break;
            }
        }
        return closest;
    };

    const targetDist = hoverDist !== null ? hoverDist : (syncDistance || null);
    const compPoint = targetDist !== null ? getPointAtDist(compLap.points, targetDist) : null;
    const basePoint = targetDist !== null && baseLap ? getPointAtDist(baseLap.points, targetDist) : null;

    return (
        <div
            className="flex flex-col w-full h-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden relative"
            ref={containerRef}
            onWheel={handleWheel}
        >
            <div className="flex justify-between p-3 border-b border-neutral-800 bg-neutral-900/50 z-10 shrink-0">
                <div className="flex gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-neutral-400">Compare</span>
                        {compPoint && (
                            <span className="text-white ml-2">
                                {Math.round(compPoint.speed)}mph |
                                B: {Math.round((compPoint.brake || 0) / 2.55)}% |
                                T: {Math.round((compPoint.accel || 0) / 2.55)}% |
                                G: {compPoint.gear}
                            </span>
                        )}
                    </div>
                    {baseLap && (
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 opacity-50"></div>
                            <span className="text-neutral-400">Reference</span>
                            {basePoint && (
                                <span className="text-white ml-2">
                                    {Math.round(basePoint.speed)}mph |
                                    B: {Math.round((basePoint.brake || 0) / 2.55)}% |
                                    T: {Math.round((basePoint.accel || 0) / 2.55)}% |
                                    G: {basePoint.gear}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setZoomX(1); setPanX(0); }} className="px-2 py-1 text-[10px] uppercase font-bold tracking-widest text-neutral-500 hover:text-white bg-neutral-800 rounded">Reset View</button>
                </div>
            </div>

            <canvas
                ref={canvasRef}
                width={dims.w}
                height={dims.h}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                className="w-full shrink-0 flex-1 cursor-crosshair"
                style={{ cursor: isPanning ? 'grabbing' : 'crosshair', display: 'block' }}
            />
        </div>
    );
}
