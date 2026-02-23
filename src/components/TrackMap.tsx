"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

const LINE_COLORS = [
    'rgba(16, 185, 129, 0.8)',  // emerald
    'rgba(59, 130, 246, 0.8)',  // blue
    'rgba(168, 85, 247, 0.8)', // purple
    'rgba(236, 72, 153, 0.8)', // pink
    'rgba(251, 191, 36, 0.8)', // amber
];

interface TrackGate {
    index: number;
    center: { x: number; z: number };
    normal: { x: number; z: number };
    p1: { x: number; z: number };
    p2: { x: number; z: number };
    distance: number;
}

interface DataPoint {
    x: number;
    z: number;
    d?: number;
    time?: number;
    speed?: number;
    brake?: number;
    accel?: number;
}

export function TrackMap({
    currentX,
    currentZ,
    carYaw,
    historicalLines = [],
    referenceLine = [],
    gates = [],
    highlightedGateIndex,
    hoverDistance,
    dynamicZoom,
    onToggleDynamicZoom,
}: {
    currentX?: number;
    currentZ?: number;
    carYaw?: number;
    historicalLines?: DataPoint[][];
    referenceLine?: { x: number; z: number }[];
    gates?: TrackGate[];
    highlightedGateIndex?: number | null;
    hoverDistance?: number | null;
    dynamicZoom?: boolean; // New prop for centering on car
    onToggleDynamicZoom?: () => void;
}) {
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const fgCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showReference, setShowReference] = useState(true);
    const [dims, setDims] = useState({ w: 800, h: 600 });

    // Zoom & Pan state
    const [zoom, setZoom] = useState(1.0);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isPanningRef = useRef(false);
    const [isPanning, setIsPanning] = useState(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    const [flipX, setFlipX] = useState(false);
    const [flipY, setFlipY] = useState(false);
    const [colorMode, setColorMode] = useState<'lap' | 'inputs'>('lap');

    // load from local storage
    useEffect(() => {
        const t = setTimeout(() => {
            if (localStorage.getItem('flipX') === 'true') setFlipX(true);
            if (localStorage.getItem('flipY') === 'true') setFlipY(true);
        }, 0);
        return () => clearTimeout(t);
    }, []);

    const toggleFlipX = () => { setFlipX(v => { localStorage.setItem('flipX', (!v).toString()); return !v; }); };
    const toggleFlipY = () => { setFlipY(v => { localStorage.setItem('flipY', (!v).toString()); return !v; }); };

    // Tooltip state
    const [tooltip, setTooltip] = useState<{
        x: number; y: number;
        lines: { label: string; color: string; speed: number; time: number }[];
    } | null>(null);

    // Resize canvas to fill container
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

    // Compute map bounds and scalar
    const transform = useMemo(() => {
        const allPoints: { x: number; z: number }[] = [];
        if (showReference && referenceLine.length > 0) allPoints.push(...referenceLine);
        historicalLines.forEach(line => allPoints.push(...line));

        if (allPoints.length < 2) return null;

        const pad = 60;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of allPoints) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        const rangeX = (maxX - minX) || 100;
        const rangeZ = (maxZ - minZ) || 100;

        const baseScale = Math.min((dims.w - pad * 2) / rangeX, (dims.h - pad * 2) / rangeZ);
        const scale = baseScale * zoom;
        const cx = dims.w / 2 + pan.x;
        const cy = dims.h / 2 + pan.y;
        const midX = (maxX + minX) / 2;
        const midZ = (maxZ + minZ) / 2;

        if (dynamicZoom && currentX !== undefined && currentZ !== undefined) {
            // Lock map so currentX/currentZ is at the exact center of screen
            // Normally: canvas_x = cx + (x - midX) * scale
            // To make canvas_x = w/2, we need: w/2 = w/2 + panX + (currentX - midX) * scale
            // => panX = -(currentX - midX) * scale
            const targetPanX = -(currentX - midX) * scale * (flipX ? -1 : 1);
            const targetPanY = -(currentZ - midZ) * scale * (flipY ? -1 : 1);

            // To prevent React re-render looping, we won't `setPan`, we'll just override cx/cy locally
            return {
                toCanvas: (x: number, z: number) => ({
                    x: dims.w / 2 + (x - currentX) * scale * (flipX ? -1 : 1),
                    y: dims.h / 2 + (z - currentZ) * scale * (flipY ? -1 : 1),
                }),
                toWorld: (canvasX: number, canvasY: number) => ({
                    x: (canvasX - dims.w / 2) / scale / (flipX ? -1 : 1) + currentX,
                    z: (canvasY - dims.h / 2) / scale / (flipY ? -1 : 1) + currentZ,
                }),
                scale,
                isDynamic: true
            };
        }

        return {
            toCanvas: (x: number, z: number) => ({
                x: cx + (x - midX) * scale * (flipX ? -1 : 1),
                y: cy + (z - midZ) * scale * (flipY ? -1 : 1),
            }),
            toWorld: (canvasX: number, canvasY: number) => ({
                x: (canvasX - cx) / scale / (flipX ? -1 : 1) + midX,
                z: (canvasY - cy) / scale / (flipY ? -1 : 1) + midZ,
            }),
            scale,
            isDynamic: false
        };
    }, [historicalLines, referenceLine, showReference, dims, zoom, pan, flipX, flipY, dynamicZoom, currentX, currentZ]);



    // Layer 1: Draw track outlines, gates, and historical lines
    useEffect(() => {
        const canvas = bgCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, dims.w, dims.h);

        if (!transform) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(0, 0, dims.w, dims.h);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for lap completion…', dims.w / 2, dims.h / 2);
            ctx.fillText('Drive your first lap to build the map limits.', dims.w / 2, dims.h / 2 + 24);
            return;
        }

        // 1. Draw reference track outline
        if (showReference && referenceLine.length > 1) {
            ctx.beginPath();
            referenceLine.forEach((p, i) => {
                const pt = transform.toCanvas(p.x, p.z);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 12 * zoom; // Was 26
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1 * zoom; // Was 1.5
            ctx.stroke();

            // Start/finish marker
            const start = transform.toCanvas(referenceLine[0].x, referenceLine[0].z);
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 6 * zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 12 * zoom, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. Draw gates
        if (gates.length > 0) {
            for (const gate of gates) {
                const p1 = transform.toCanvas(gate.p1.x, gate.p1.z);
                const p2 = transform.toCanvas(gate.p2.x, gate.p2.z);
                const isHighlighted = highlightedGateIndex === gate.index;

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);

                if (isHighlighted) {
                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
                    ctx.lineWidth = 3 * zoom;
                    ctx.setLineDash([]);
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                    ctx.lineWidth = 1 * zoom;
                    ctx.setLineDash([4 * zoom, 4 * zoom]);
                }
                ctx.stroke();
                ctx.setLineDash([]);

                // Gate number label (only when zoomed enough)
                if (transform.scale > 0.3 || isHighlighted) {
                    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                    ctx.fillStyle = isHighlighted ? 'rgba(251, 191, 36, 0.9)' : 'rgba(255, 255, 255, 0.25)';
                    ctx.font = isHighlighted ? 'bold 11px sans-serif' : '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${gate.index}`, mid.x, mid.y - 6);
                }
            }
        }

        // 3. Draw historical lap lines
        historicalLines.forEach((line, idx) => {
            if (line.length < 2) return;

            const defaultColor = LINE_COLORS[idx % LINE_COLORS.length];

            for (let i = 1; i < line.length; i++) {
                const pt1 = transform.toCanvas(line[i - 1].x, line[i - 1].z);
                const pt2 = transform.toCanvas(line[i].x, line[i].z);

                let color = defaultColor;
                if (colorMode === 'inputs') {
                    // Check inputs at point i
                    const b = line[i].brake || 0;
                    const a = line[i].accel || 0;
                    if (b > 10) {
                        color = 'rgba(239, 68, 68, 0.9)'; // red
                    } else if (a > 10) {
                        color = 'rgba(34, 197, 94, 0.9)'; // green
                    } else {
                        color = 'rgba(251, 191, 36, 0.9)'; // yellow coasting
                    }
                }

                ctx.beginPath();
                ctx.moveTo(pt1.x, pt1.y);
                ctx.lineTo(pt2.x, pt2.y);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.2 * zoom; // Was 2.5
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        });

    }, [historicalLines, referenceLine, showReference, dims, transform, gates, highlightedGateIndex, zoom, colorMode]);


    // Layer 2: Draw current car position (runs 30fps)
    useEffect(() => {
        const canvas = fgCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, dims.w, dims.h);

        if (currentX !== undefined && currentZ !== undefined) {
            let pt = { x: dims.w / 2, y: dims.h / 2 };
            if (transform) {
                pt = transform.toCanvas(currentX, currentZ);
            }

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
            ctx.fill();

            ctx.save();
            ctx.translate(pt.x, pt.y);
            if (carYaw !== undefined) ctx.rotate(carYaw);
            ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(6, 7);
            ctx.lineTo(-6, 7);
            ctx.closePath();
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
            ctx.strokeStyle = '#93c5fd';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        // Draw Hover Scrubber Dot from TelemetryChart
        if (hoverDistance !== undefined && hoverDistance !== null && transform) {
            historicalLines.forEach((line, idx) => {
                // Find point matching distance
                if (!line || line.length === 0) return;
                let closest = line[0];
                let minDist = Math.abs((closest.d || 0) - hoverDistance);
                for (let i = 1; i < line.length; i++) {
                    const d = Math.abs((line[i].d || 0) - hoverDistance);
                    if (d < minDist) {
                        minDist = d;
                        closest = line[i];
                    } else if (d > minDist) {
                        break;
                    }
                }

                if (closest && minDist < 50) { // Only draw if we found a point roughly close
                    const pt = transform.toCanvas(closest.x, closest.z);
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
                    ctx.fillStyle = LINE_COLORS[idx % LINE_COLORS.length];
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        }

    }, [currentX, currentZ, carYaw, dims, transform, flipX, flipY, hoverDistance, historicalLines]);

    // Mouse handlers for zoom & pan
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(prev => Math.min(Math.max(prev * delta, 0.3), 10));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        isPanningRef.current = true;
        setIsPanning(true);
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanningRef.current && !dynamicZoom) {
            const dx = e.clientX - lastMouseRef.current.x;
            const dy = e.clientY - lastMouseRef.current.y;
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            setTooltip(null);
            return;
        }

        // Tooltip: find nearest point on each line
        if (!transform || historicalLines.length === 0) {
            setTooltip(null);
            return;
        }

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseCanvasX = e.clientX - rect.left;
        const mouseCanvasY = e.clientY - rect.top;

        const tooltipLines: { label: string; color: string; speed: number; time: number }[] = [];
        const maxDistPx = 25;

        historicalLines.forEach((line, idx) => {
            let bestDist = Infinity;
            let bestPt: DataPoint | null = null;

            for (const p of line) {
                const cp = transform.toCanvas(p.x, p.z);
                const dx = cp.x - mouseCanvasX;
                const dy = cp.y - mouseCanvasY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPt = p;
                }
            }

            if (bestDist < maxDistPx && bestPt) {
                tooltipLines.push({
                    label: `Lap ${idx + 1}`,
                    color: LINE_COLORS[idx % LINE_COLORS.length],
                    speed: Math.round(bestPt.speed || 0),
                    time: bestPt.time || 0,
                });
            }
        });

        if (tooltipLines.length > 0) {
            setTooltip({ x: mouseCanvasX, y: mouseCanvasY, lines: tooltipLines });
        } else {
            setTooltip(null);
        }
    }, [transform, historicalLines]);

    const handleMouseUp = useCallback(() => {
        isPanningRef.current = false;
        setIsPanning(false);
    }, []);

    const handleMouseLeave = useCallback(() => {
        isPanningRef.current = false;
        setIsPanning(false);
        setTooltip(null);
    }, []);

    const resetView = useCallback(() => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
    }, []);


    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex flex-col group"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
            {/* Controls overlay */}
            <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                <div className="flex bg-neutral-900/90 rounded-lg p-0.5 border border-neutral-700 backdrop-blur-sm self-end">
                    <button
                        onClick={() => setColorMode('lap')}
                        className={`px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${colorMode === 'lap' ? 'bg-indigo-500/20 text-indigo-400' : 'text-neutral-500 hover:text-white'}`}
                    >
                        Lap Colors
                    </button>
                    <button
                        onClick={() => setColorMode('inputs')}
                        className={`px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-md transition-colors flex items-center gap-1 ${colorMode === 'inputs' ? 'bg-amber-500/20 text-amber-400' : 'text-neutral-500 hover:text-white'}`}
                    >
                        Inputs <div className="flex"><div className="w-2 h-2 rounded-full bg-red-500"></div><div className="w-2 h-2 rounded-full bg-green-500 -ml-1"></div></div>
                    </button>
                </div>

                <label className="flex items-center space-x-2 text-xs text-neutral-400 bg-neutral-900/90 px-3 py-1.5 rounded-lg border border-neutral-700 cursor-pointer select-none backdrop-blur-sm self-end">
                    <input
                        type="checkbox"
                        checked={showReference}
                        onChange={e => setShowReference(e.target.checked)}
                        className="rounded border-neutral-600 bg-neutral-800 text-indigo-500 w-3.5 h-3.5"
                    />
                    <span>Show Track Outline</span>
                </label>

                <div className="flex gap-2">
                    <label className="flex items-center space-x-2 text-xs text-neutral-400 bg-neutral-900/90 px-3 py-1.5 rounded-lg border border-neutral-700 cursor-pointer select-none backdrop-blur-sm">
                        <input
                            type="checkbox"
                            checked={flipX}
                            onChange={toggleFlipX}
                            className="rounded border-neutral-600 bg-neutral-800 text-indigo-500 w-3.5 h-3.5"
                        />
                        <span>Flip X</span>
                    </label>
                    <label className="flex items-center space-x-2 text-xs text-neutral-400 bg-neutral-900/90 px-3 py-1.5 rounded-lg border border-neutral-700 cursor-pointer select-none backdrop-blur-sm">
                        <input
                            type="checkbox"
                            checked={flipY}
                            onChange={toggleFlipY}
                            className="rounded border-neutral-600 bg-neutral-800 text-indigo-500 w-3.5 h-3.5"
                        />
                        <span>Flip Y</span>
                    </label>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setZoom(prev => Math.min(prev * 1.3, 10))}
                        className="bg-neutral-900/90 border border-neutral-700 text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-sm"
                    >+</button>
                    <button
                        onClick={() => setZoom(prev => Math.max(prev * 0.7, 0.3))}
                        className="bg-neutral-900/90 border border-neutral-700 text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-sm"
                    >−</button>
                    <button
                        onClick={resetView}
                        className="bg-neutral-900/90 border border-neutral-700 text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-sm"
                    >Reset</button>

                    {dynamicZoom !== undefined && (
                        <div className="w-px h-4 bg-neutral-700 mx-1"></div>
                    )}
                    {dynamicZoom !== undefined && (
                        <button
                            onClick={(e) => { e.stopPropagation(); if (onToggleDynamicZoom) onToggleDynamicZoom(); }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-sm border transition-colors ${dynamicZoom ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-neutral-900/90 border-neutral-700 text-neutral-400 hover:text-white'}`}
                        >
                            {dynamicZoom ? "Auto-Focus On" : "Auto-Focus Off"}
                        </button>
                    )}
                </div>
            </div>

            {/* Background layer (Static lines) */}
            <canvas
                ref={bgCanvasRef}
                width={dims.w}
                height={dims.h}
                className="absolute inset-0 w-full h-full z-0"
            />

            {/* Foreground layer (30fps Car) */}
            <canvas
                ref={fgCanvasRef}
                width={dims.w}
                height={dims.h}
                className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            />

            {/* Tooltip overlay */}
            {tooltip && (
                <div
                    className="absolute z-30 pointer-events-none bg-neutral-950/95 border border-neutral-700 rounded-lg px-3 py-2 shadow-2xl"
                    style={{
                        left: tooltip.x + 15,
                        top: tooltip.y - 10,
                        transform: tooltip.x > dims.w - 180 ? 'translateX(-120%)' : undefined,
                    }}
                >
                    {tooltip.lines.map((line, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs whitespace-nowrap py-0.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
                            <span className="text-neutral-400 font-bold">{line.label}</span>
                            <span className="text-white font-mono">{line.speed} mph</span>
                            <span className="text-neutral-500 font-mono">
                                {Math.floor(line.time / 60)}:{Math.floor(line.time % 60).toString().padStart(2, '0')}.{Math.floor((line.time * 1000) % 1000).toString().padStart(3, '0')}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
