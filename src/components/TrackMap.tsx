"use client";

import { useEffect, useRef, useState, useMemo } from 'react';

export function TrackMap({
    currentX,
    currentZ,
    carYaw,
    historicalLines = [],
    referenceLine = [],
}: {
    currentX?: number;
    currentZ?: number;
    carYaw?: number;
    historicalLines?: { x: number; z: number }[][];
    referenceLine?: { x: number; z: number }[];
}) {
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const fgCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showReference, setShowReference] = useState(true);
    const [dims, setDims] = useState({ w: 800, h: 600 });

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

    // Compute map bounds and scalar ONCE whenever the completed laps change
    const transform = useMemo(() => {
        const allPoints: { x: number; z: number }[] = [];
        if (showReference && referenceLine.length > 0) allPoints.push(...referenceLine);
        historicalLines.forEach(line => allPoints.push(...line));

        // If no completed laps yet, we center around the car's current position to show it, or origin
        if (allPoints.length < 2) {
            return null;
        }

        const pad = 60;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of allPoints) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        // Protect against zero range causing infinity scale
        const rangeX = (maxX - minX) || 100;
        const rangeZ = (maxZ - minZ) || 100;

        // Auto scale to fit track
        const scale = Math.min((dims.w - pad * 2) / rangeX, (dims.h - pad * 2) / rangeZ);
        const cx = dims.w / 2;
        const cy = dims.h / 2;
        const midX = (maxX + minX) / 2;
        const midZ = (maxZ + minZ) / 2;

        return {
            toCanvas: (x: number, z: number) => ({
                x: cx + (x - midX) * scale,
                y: cy + (z - midZ) * scale,
            })
        };
    }, [historicalLines, referenceLine, showReference, dims]);

    // Layer 1: Draw track outlines (only runs when lines change, not every 30ms frame)
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

        // 1. Draw reference track outline (from first lap)
        if (showReference && referenceLine.length > 1) {
            ctx.beginPath();
            referenceLine.forEach((p, i) => {
                const pt = transform.toCanvas(p.x, p.z);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 26;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();

            // Thin center line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Start/finish marker
            const start = transform.toCanvas(referenceLine[0].x, referenceLine[0].z);
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 12, 0, Math.PI * 2);
            ctx.fill();
        }

        // 2. Draw historical lap lines
        const colors = [
            'rgba(16, 185, 129, 0.7)',  // emerald
            'rgba(59, 130, 246, 0.7)',  // blue
            'rgba(168, 85, 247, 0.7)', // purple
            'rgba(236, 72, 153, 0.7)', // pink
            'rgba(251, 191, 36, 0.7)', // amber
        ];

        historicalLines.forEach((line, idx) => {
            if (line.length < 2) return;
            ctx.beginPath();
            line.forEach((p, i) => {
                const pt = transform.toCanvas(p.x, p.z);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.strokeStyle = colors[idx % colors.length];
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.stroke();
        });

    }, [historicalLines, referenceLine, showReference, dims, transform]);


    // Layer 2: Draw current car position (runs 30fps)
    useEffect(() => {
        const canvas = fgCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, dims.w, dims.h);

        if (currentX !== undefined && currentZ !== undefined) {

            // If we don't have a map transform yet, just render in center
            let pt = { x: dims.w / 2, y: dims.h / 2 };
            if (transform) {
                pt = transform.toCanvas(currentX, currentZ);
            }

            // Glow
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
            ctx.fill();

            ctx.save();
            ctx.translate(pt.x, pt.y);
            if (carYaw !== undefined) ctx.rotate(carYaw);

            // Car triangle
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

    }, [currentX, currentZ, carYaw, dims, transform]);

    return (
        <div ref={containerRef} className="relative w-full h-full flex flex-col group">
            <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <label className="flex items-center space-x-2 text-xs text-neutral-400 bg-neutral-900/90 px-3 py-1.5 rounded-lg border border-neutral-700 cursor-pointer select-none backdrop-blur-sm">
                    <input
                        type="checkbox"
                        checked={showReference}
                        onChange={e => setShowReference(e.target.checked)}
                        className="rounded border-neutral-600 bg-neutral-800 text-indigo-500 w-3.5 h-3.5"
                    />
                    <span>Show Track Outline</span>
                </label>
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
        </div>
    );
}
