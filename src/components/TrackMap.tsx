"use client";

import { useEffect, useRef, useState } from 'react';

// The track map works entirely from real position data captured during gameplay.
// When the user drives the first lap, we capture those points as the "reference line" (track outline).
// Subsequent laps are overlaid on top for comparison.
// There is NO hardcoded shape — real game coordinates are the only source of truth.
// A settings toggle lets the user hide/show the reference track outline.

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
    const canvasRef = useRef<HTMLCanvasElement>(null);
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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, dims.w, dims.h);

        // Collect all known points for auto-scaling
        const allPoints: { x: number; z: number }[] = [];
        if (showReference && referenceLine.length > 0) allPoints.push(...referenceLine);
        historicalLines.forEach(line => allPoints.push(...line));
        if (currentX !== undefined && currentZ !== undefined) allPoints.push({ x: currentX, z: currentZ });

        if (allPoints.length < 2) {
            // Not enough data — draw placeholder
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(0, 0, dims.w, dims.h);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for position data…', dims.w / 2, dims.h / 2);
            ctx.fillText('Drive a lap to build the track map', dims.w / 2, dims.h / 2 + 24);
            return;
        }

        // Compute bounding box with padding
        const pad = 60;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of allPoints) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }

        const rangeX = maxX - minX || 1;
        const rangeZ = maxZ - minZ || 1;
        const scale = Math.min((dims.w - pad * 2) / rangeX, (dims.h - pad * 2) / rangeZ);
        const cx = dims.w / 2;
        const cy = dims.h / 2;
        const midX = (maxX + minX) / 2;
        const midZ = (maxZ + minZ) / 2;

        const toCanvas = (x: number, z: number) => ({
            x: cx + (x - midX) * scale,
            y: cy + (z - midZ) * scale,
        });

        // 1. Draw reference track outline (from first lap)
        if (showReference && referenceLine.length > 1) {
            // Thick faded "road" background
            ctx.beginPath();
            referenceLine.forEach((p, i) => {
                const pt = toCanvas(p.x, p.z);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 24;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();

            // Thin center line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Start/finish marker
            const start = toCanvas(referenceLine[0].x, referenceLine[0].z);
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
                const pt = toCanvas(p.x, p.z);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.strokeStyle = colors[idx % colors.length];
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.stroke();
        });

        // 3. Draw current car position
        if (currentX !== undefined && currentZ !== undefined) {
            const pt = toCanvas(currentX, currentZ);

            // Glow
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
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
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

    }, [currentX, currentZ, carYaw, historicalLines, referenceLine, showReference, dims]);

    return (
        <div ref={containerRef} className="relative w-full h-full flex flex-col group">
            <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <canvas
                ref={canvasRef}
                width={dims.w}
                height={dims.h}
                className="w-full h-full"
            />
        </div>
    );
}
