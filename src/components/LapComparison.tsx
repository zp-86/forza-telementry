import { LapData } from "@/hooks/useLapManager";
import { ArrowLeft, Map as MapIcon } from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TrackMap } from "./TrackMap";
import { TelemetryChart } from "./TelemetryChart";
import referenceLineData from "@/lib/reference_line.json";
import trackGates from "@/lib/gates.json";

const formatTime = (seconds: number) => {
    if (!seconds || seconds <= 0) return "-";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export function LapComparison({
    baseLap,
    compLap,
    isSingleView,
    onClose
}: {
    baseLap?: LapData,
    compLap: LapData,
    isSingleView: boolean,
    onClose: () => void
}) {

    // In compare mode, user can click either lap card to set it as the "focus" (reference) lap.
    // Deltas are shown relative to the focused lap.
    const [focusedId, setFocusedId] = useState<string>(baseLap?.id || compLap.id);
    const [hoveredGate, setHoveredGate] = useState<number | null>(null);
    const [hoverDistance, setHoverDistance] = useState<number | null>(null);

    // Determine which lap is "focus" (reference) and which is "compared"
    const lapA = baseLap || compLap;
    const lapB = compLap;
    const focusLap = (focusedId === lapB.id ? lapB : lapA);
    const otherLap = (focusLap.id === lapA.id ? lapB : lapA);

    // Lock body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // 2D Line intersection math
    type BasicPoint = { x: number, z: number };
    type DataPoint = { x: number, z: number, time: number, speed: number, d?: number };
    const ccw = (A: BasicPoint, B: BasicPoint, C: BasicPoint) => (C.z - A.z) * (B.x - A.x) > (B.z - A.z) * (C.x - A.x);
    const segmentsIntersect = (A: BasicPoint, B: BasicPoint, C: BasicPoint, D: BasicPoint) => ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);

    const findStartGateIdx = (firstPoint: BasicPoint) => {
        for (let g = 0; g < trackGates.length; g++) {
            const gate = trackGates[g];
            const dx = firstPoint.x - gate.center.x;
            const dz = firstPoint.z - gate.center.z;
            const dot = dx * gate.normal.x + dz * gate.normal.z;
            if (dot > 0) continue;
            return g;
        }
        return 0;
    };

    const getLapGateTimes = (lapPoints: DataPoint[]) => {
        if (lapPoints.length < 2) return [];
        let nextGateIdx = findStartGateIdx(lapPoints[0]);
        const crossedGates: { gateIndex: number, gateDist: number, time: number, speed: number }[] = [];
        for (let i = 1; i < lapPoints.length; i++) {
            const ptPrev = lapPoints[i - 1];
            const ptCurr = lapPoints[i];
            while (nextGateIdx < trackGates.length) {
                const gate = trackGates[nextGateIdx];
                if (segmentsIntersect(ptPrev, ptCurr, gate.p1, gate.p2)) {
                    crossedGates.push({ gateIndex: gate.index, gateDist: gate.distance, time: ptCurr.time, speed: ptCurr.speed });
                    nextGateIdx++;
                } else {
                    break;
                }
            }
            if (nextGateIdx >= trackGates.length) break;
        }
        return crossedGates;
    };

    // Compute sector rows
    const sectorRows = useMemo(() => {
        const rows: {
            index: number, distText: string,
            focusSpeed: number, otherSpeed: number,
            sectorRaw: string, timeRaw: string,
            deltaText: string, isWorse: boolean,
            isCorner: boolean, rawDist: number,
            maxBrake?: number, otherMaxBrake?: number
        }[] = [];

        if (isSingleView) {
            const crossings = getLapGateTimes(compLap.points);
            let lastTime = 0;
            for (const c of crossings) {
                const sectorTime = c.time - lastTime;
                rows.push({
                    index: c.gateIndex,
                    distText: (c.gateDist / 1000).toFixed(1) + " km",
                    focusSpeed: Math.round(c.speed || 0),
                    otherSpeed: 0,
                    sectorRaw: sectorTime.toFixed(2),
                    timeRaw: c.time.toFixed(2),
                    deltaText: "-",
                    isWorse: false,
                    isCorner: false,
                    rawDist: c.gateDist
                });
                lastTime = c.time;
            }

            // Merge corners
            if (compLap.corners) {
                for (const c of compLap.corners) {
                    rows.push({
                        index: c.index,
                        distText: (c.startDist / 1000).toFixed(1) + " km",
                        focusSpeed: Math.round(c.minSpeed),
                        otherSpeed: 0,
                        sectorRaw: "Cnr " + c.index,
                        timeRaw: "-",
                        deltaText: "-",
                        isWorse: false,
                        isCorner: true,
                        rawDist: c.startDist
                    });
                }
            }
            return rows.sort((a, b) => a.rawDist - b.rawDist);
        }

        // Compare mode: compute crossings for both laps
        const focusCrossings = getLapGateTimes(focusLap.points);
        const otherCrossings = getLapGateTimes(otherLap.points);
        const otherByGate = new Map(otherCrossings.map(c => [c.gateIndex, c]));

        let lastFocusTime = 0;

        for (const fc of focusCrossings) {
            const oc = otherByGate.get(fc.gateIndex);
            const sectorTime = fc.time - lastFocusTime;

            if (oc) {
                const delta = oc.time - fc.time;
                rows.push({
                    index: fc.gateIndex,
                    distText: (fc.gateDist / 1000).toFixed(1) + " km",
                    focusSpeed: Math.round(fc.speed),
                    otherSpeed: Math.round(oc.speed),
                    sectorRaw: sectorTime.toFixed(2),
                    timeRaw: fc.time.toFixed(2),
                    deltaText: (delta > 0 ? "+" : "") + delta.toFixed(3),
                    isWorse: delta < 0, // other lap is faster at this gate
                    isCorner: false,
                    rawDist: fc.gateDist
                });
            } else {
                rows.push({
                    index: fc.gateIndex,
                    distText: (fc.gateDist / 1000).toFixed(1) + " km",
                    focusSpeed: Math.round(fc.speed),
                    otherSpeed: 0,
                    sectorRaw: sectorTime.toFixed(2),
                    timeRaw: fc.time.toFixed(2),
                    deltaText: "-",
                    isWorse: false,
                    isCorner: false,
                    rawDist: fc.gateDist
                });
            }
            lastFocusTime = fc.time;
        }

        // Merge Corners in Compare Mode
        if (focusLap.corners) {
            const otherCorners = otherLap.corners || [];

            for (const fc of focusLap.corners) {
                // To compare corners between laps, we match by index (assuming track layout is identical)
                const oc = otherCorners.find(c => c.index === fc.index);

                rows.push({
                    index: fc.index,
                    distText: (fc.startDist / 1000).toFixed(1) + " km",
                    focusSpeed: Math.round(fc.minSpeed),
                    otherSpeed: oc ? Math.round(oc.minSpeed) : 0,
                    sectorRaw: "Cnr " + fc.index,
                    timeRaw: "-",
                    deltaText: oc ? (fc.minSpeed < oc.minSpeed ? `-${(oc.minSpeed - fc.minSpeed).toFixed(1)}mph` : `+${(fc.minSpeed - oc.minSpeed).toFixed(1)}mph`) : "-",
                    isWorse: oc ? fc.minSpeed < oc.minSpeed : false, // Worse meaning slower min speed
                    isCorner: true,
                    rawDist: fc.startDist,
                    maxBrake: fc.maxBrake,
                    otherMaxBrake: oc ? oc.maxBrake : undefined
                });
            }
        }

        return rows.sort((a, b) => a.rawDist - b.rawDist);
    }, [focusLap.points, otherLap.points, isSingleView, compLap.points, focusLap.corners, otherLap.corners, compLap.corners]);

    const modalContent = (
        <div className="fixed inset-0 bg-neutral-950/95 backdrop-blur-xl z-[9999] flex flex-col p-6" style={{ overflow: "auto" }}>

            <div className="flex items-center justify-between mb-8 border-b border-neutral-800 pb-4 flex-shrink-0">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-bold tracking-widest text-sm uppercase">Back</span>
                </button>
                <div className="flex flex-col items-end">
                    <h2 className="text-xl font-bold tracking-tighter">
                        {isSingleView ? "Lap Analysis" : "Comparison View"}
                    </h2>
                    {!isSingleView && (
                        <span className="text-neutral-500 text-xs mt-1">Click a lap card to set it as the reference</span>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-6 flex-1 min-h-0">

                {/* Top Half: Cards, Map & Table */}
                <div className="grid grid-cols-2 gap-8 h-1/2 min-h-0 shrink-0">

                    {/* Left Col: Lap Summaries + Table */}
                    <div className="flex flex-col gap-6 min-h-0">

                        {isSingleView ? (
                            /* Single View: just one card */
                            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-6">
                                <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
                                    Selected Lap
                                </div>
                                <div className="text-2xl font-bold">{compLap.playerName} - Lap {compLap.lapNumber}</div>
                                <div className="text-4xl font-mono font-light tracking-tighter mt-4 text-white">
                                    {formatTime(compLap.finalTime)}
                                </div>
                            </div>
                        ) : (
                            /* Compare View: two clickable cards */
                            <div className="grid grid-cols-2 gap-4">
                                {/* Lap A */}
                                <div
                                    onClick={() => setFocusedId(lapA.id)}
                                    className={`rounded-xl p-6 cursor-pointer transition-all border ${focusedId === lapA.id
                                        ? 'bg-emerald-900/20 border-emerald-500/30 ring-2 ring-emerald-500/20'
                                        : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                                        }`}
                                >
                                    <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${focusedId === lapA.id ? 'text-emerald-400' : 'text-neutral-500'}`}>
                                        {focusedId === lapA.id ? '★ Reference' : 'Lap A'}
                                    </div>
                                    <div className="text-lg font-bold">{lapA.playerName} - Lap {lapA.lapNumber}</div>
                                    <div className="text-3xl font-mono font-light tracking-tighter mt-3 text-white">
                                        {formatTime(lapA.finalTime)}
                                    </div>
                                </div>

                                {/* Lap B */}
                                <div
                                    onClick={() => setFocusedId(lapB.id)}
                                    className={`rounded-xl p-6 cursor-pointer transition-all border ${focusedId === lapB.id
                                        ? 'bg-emerald-900/20 border-emerald-500/30 ring-2 ring-emerald-500/20'
                                        : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                                        }`}
                                >
                                    <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${focusedId === lapB.id ? 'text-emerald-400' : 'text-neutral-500'}`}>
                                        {focusedId === lapB.id ? '★ Reference' : 'Lap B'}
                                    </div>
                                    <div className="text-lg font-bold">{lapB.playerName} - Lap {lapB.lapNumber}</div>
                                    <div className="text-3xl font-mono font-light tracking-tighter mt-3 text-white">
                                        {formatTime(lapB.finalTime)}
                                    </div>
                                    {lapA.id !== lapB.id && (
                                        <div className={`text-sm font-mono font-bold mt-2 ${lapB.finalTime > lapA.finalTime ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {lapB.finalTime > lapA.finalTime ? '+' : ''}{formatTime(Math.abs(lapB.finalTime - lapA.finalTime))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Checkpoint Table */}
                        <div className="flex-1 bg-neutral-900/50 border border-neutral-800 rounded-xl flex flex-col overflow-hidden min-h-0">
                            <div className={`grid ${isSingleView ? 'grid-cols-4' : 'grid-cols-5'} px-4 py-3 bg-neutral-900 text-xs font-bold tracking-widest text-neutral-500 uppercase border-b border-neutral-800 flex-shrink-0`}>
                                <div>Gate</div>
                                <div className="text-right">Distance</div>
                                <div className="text-right">Sector Time</div>
                                <div className="text-right">Speed</div>
                                {!isSingleView && <div className="text-right">Delta</div>}
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {sectorRows.length === 0 && (
                                    <div className="p-8 text-center text-neutral-500 text-sm tracking-widest leading-relaxed">
                                        No gate crossings recorded for this lap.<br />Drive a full lap to see sector breakdowns!
                                    </div>
                                )}
                                {sectorRows.map(row => (
                                    <div
                                        key={row.isCorner ? `corner-${row.index}` : `gate-${row.index}`}
                                        onMouseEnter={() => !row.isCorner && setHoveredGate(row.index)}
                                        onMouseLeave={() => !row.isCorner && setHoveredGate(null)}
                                        className={`grid ${isSingleView ? 'grid-cols-4' : 'grid-cols-5'} px-4 py-3 border-b border-neutral-800/50 items-center hover:bg-neutral-800/30 transition-colors ${!row.isCorner && hoveredGate === row.index ? 'bg-amber-900/10' : ''} ${row.isCorner ? 'bg-neutral-900/40 text-neutral-400' : ''}`}
                                    >
                                        <div className={`font-bold text-sm ${row.isCorner ? 'text-indigo-400' : 'text-neutral-400'}`}>
                                            {row.isCorner ? `Cnr ${row.index}` : `Gate ${row.index}`}
                                        </div>
                                        <div className={`text-right text-sm font-mono ${row.isCorner ? 'text-neutral-600' : 'text-neutral-500'}`}>{row.distText}</div>

                                        <div className="text-right font-mono flex flex-col items-end">
                                            {row.isCorner ? (
                                                <>
                                                    <span className="text-neutral-400 text-sm">{row.sectorRaw}</span>
                                                    {row.maxBrake !== undefined && (
                                                        <span className="text-red-400/80 text-[10px] uppercase">Brk: {Math.round(row.maxBrake / 2.55)}%</span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-white text-sm">{row.sectorRaw}s</span>
                                                    <span className="text-neutral-600 text-[10px] uppercase">Lap: {row.timeRaw}s</span>
                                                </>
                                            )}
                                        </div>

                                        <div className="text-right font-mono flex flex-col items-end">
                                            <span className="text-white text-sm">{row.focusSpeed} mph</span>
                                            {!isSingleView && row.otherSpeed > 0 && row.focusSpeed !== row.otherSpeed && (
                                                <span className={`text-[10px] ${row.focusSpeed > row.otherSpeed ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {row.focusSpeed > row.otherSpeed ? '+' : ''}{row.focusSpeed - row.otherSpeed} mph
                                                </span>
                                            )}
                                        </div>

                                        {!isSingleView && (
                                            <div className={`text-right font-mono font-bold ${row.isCorner ? (row.isWorse ? 'text-red-400' : (row.deltaText !== "-" ? 'text-emerald-400' : 'text-neutral-500')) : (row.deltaText === '-' ? 'text-neutral-500' : (row.isWorse ? 'text-red-400' : 'text-emerald-400'))}`}>
                                                {row.isCorner ? row.deltaText : (row.deltaText === '-' ? '-' : row.deltaText + 's')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Col: Track Map & Visualizer */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-1 flex flex-col relative overflow-hidden">
                        <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-neutral-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-neutral-800">
                            <MapIcon className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">GPS Trace Map</span>
                        </div>

                        <div className="flex-1 w-full h-full relative rounded-lg overflow-hidden">
                            <TrackMap
                                historicalLines={isSingleView || !baseLap ? [compLap.points] : [lapA.points, lapB.points]}
                                referenceLine={referenceLineData as { x: number, z: number }[]}
                                gates={trackGates}
                                highlightedGateIndex={hoveredGate}
                                hoverDistance={hoverDistance}
                            />
                        </div>
                    </div>
                </div>

                {/* Bottom Half: Telemetry Chart */}
                <div className="flex-1 min-h-0 pb-2">
                    <TelemetryChart
                        baseLap={isSingleView ? undefined : baseLap}
                        compLap={compLap}
                        onHover={setHoverDistance}
                    />
                </div>

            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
