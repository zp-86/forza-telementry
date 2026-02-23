import { useState, useEffect, useRef } from 'react';
import trackGates from '@/lib/gates.json';

export interface Checkpoint {
    distance: number;
    time: number;
    speed: number;
}

export interface LapData {
    id: string;
    lapNumber: number;
    playerName: string;
    finalTime: number; // in seconds
    checkpoints: Checkpoint[];
    invalid: boolean; // if game paused or off track
    points: {
        x: number;
        z: number;
        d?: number;
        time: number;
        speed: number;
        brake?: number;
        accel?: number;
        steer?: number;
        gear?: number;
        rpm?: number;
    }[]; // driving line + mini-sectors
    corners?: {
        index: number;
        startDist: number;
        endDist: number;
        maxBrake: number;
        minSpeed: number;
        avgSteer: number;
    }[];
}

// Gate crossing check helpers (same math as LapComparison)
type BasicPoint = { x: number, z: number };
const ccw = (A: BasicPoint, B: BasicPoint, C: BasicPoint) => (C.z - A.z) * (B.x - A.x) > (B.z - A.z) * (C.x - A.x);
const segmentsIntersect = (A: BasicPoint, B: BasicPoint, C: BasicPoint, D: BasicPoint) =>
    ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLapManager(telemetryData: any, currentPlayerName: string) {
    const [laps, setLaps] = useState<LapData[]>([]);

    // Mutable refs to track current lap state without causing endless re-renders
    const currentLapRef = useRef<{
        lapNumber: number;
        startTime: number;
        startDistance: number;
        checkpoints: Checkpoint[];
        points: { x: number; z: number; d?: number; time: number; speed: number, brake?: number, accel?: number, steer?: number, gear?: number, rpm?: number }[];
        invalid: boolean;
        lastCheckpointDistance: number;
        gatesCrossed: number; // how many gates the car crossed this lap
        nextGateIdx: number; // which gate we're looking for next
    }>({
        lapNumber: -1,
        startTime: 0,
        startDistance: 0,
        checkpoints: [],
        points: [],
        invalid: false,
        lastCheckpointDistance: -1,
        gatesCrossed: 0,
        nextGateIdx: 0,
    });

    // Track the highest lap number seen to handle Forza resetting to 0
    const lapOffsetRef = useRef<{ highestRawLap: number; offset: number }>({
        highestRawLap: -1,
        offset: 0,
    });

    useEffect(() => {
        if (!telemetryData || telemetryData.IsRaceOn === 0) return;

        // ---- PAUSE DETECTION: Skip all processing when at 0,0 ----
        if (telemetryData.PositionX === 0 && telemetryData.PositionZ === 0) {
            return;
        }

        const current = currentLapRef.current;
        const lapTracker = lapOffsetRef.current;

        // ---- LAP RESET OFFSET: Handle Forza resetting LapNumber to 0 ----
        const rawLap = telemetryData.LapNumber;
        let effectiveLap = rawLap;

        if (rawLap < lapTracker.highestRawLap && lapTracker.highestRawLap !== -1) {
            // Forza reset (user went to event menu). Add offset.
            lapTracker.offset = lapTracker.highestRawLap + 1 + lapTracker.offset;
            lapTracker.highestRawLap = rawLap;
        }
        if (rawLap > lapTracker.highestRawLap) {
            lapTracker.highestRawLap = rawLap;
        }
        effectiveLap = rawLap + lapTracker.offset;

        // Detect new lap
        if (effectiveLap !== current.lapNumber) {
            if (current.lapNumber !== -1) {
                // ---- PIT INVALIDATION: If we missed too many gates, mark invalid ----
                // A clean lap should cross most of the gates. If less than half were crossed, it's a pit/shortcut.
                const minGatesRequired = Math.floor(trackGates.length * 0.5);
                const missedTooMany = current.gatesCrossed < minGatesRequired && current.points.length > 10;

                // Determine lap time: use telemetry LastLap if available, otherwise calculate fallback
                const lapTime = telemetryData.LastLap > 0
                    ? telemetryData.LastLap
                    : (telemetryData.CurrentRaceTime - current.startTime);

                // --- CORNER DETECTION ALGORITHM ---
                // We will scan the points to find contiguous regions of braking/steering
                const corners: { index: number; startDist: number; endDist: number; maxBrake: number; minSpeed: number; avgSteer: number; }[] = [];
                let inCorner = false;
                let cStart = 0;
                let cMaxBrake = 0;
                let cMinSpeed = Infinity;
                let cSteerSum = 0;
                let cSteerCount = 0;
                let cornerIdx = 1;

                for (let i = 0; i < current.points.length; i++) {
                    const p = current.points[i];
                    const isBraking = (p.brake || 0) > 15; // > ~5% brake
                    const isTurning = Math.abs(p.steer || 0) > 20; // some significant steering

                    if (isBraking || isTurning) {
                        if (!inCorner) {
                            inCorner = true;
                            cStart = p.d || 0;
                            cMaxBrake = 0;
                            cMinSpeed = Infinity;
                            cSteerSum = 0;
                            cSteerCount = 0;
                        }
                        cMaxBrake = Math.max(cMaxBrake, p.brake || 0);
                        cMinSpeed = Math.min(cMinSpeed, p.speed);
                        cSteerSum += (p.steer || 0);
                        cSteerCount++;
                    } else if (inCorner) {
                        // Finished corner? Wait to see if we are really out of it (straight for > 30 meters)
                        // For simplicity, we just close the corner when neither braking nor turning
                        const length = (p.d || 0) - cStart;
                        if (length > 20) { // corner must be at least 20 meters long
                            corners.push({
                                index: cornerIdx++,
                                startDist: cStart,
                                endDist: p.d || 0,
                                maxBrake: cMaxBrake,
                                minSpeed: cMinSpeed,
                                avgSteer: cSteerSum / cSteerCount
                            });
                        }
                        inCorner = false;
                    }
                }

                // Save previous lap
                const finishedLap: LapData = {
                    id: `${current.lapNumber}-${Date.now()}`,
                    lapNumber: current.lapNumber,
                    playerName: currentPlayerName,
                    finalTime: lapTime,
                    checkpoints: [...current.checkpoints],
                    invalid: current.invalid || missedTooMany,
                    points: [...current.points],
                    corners: corners
                };

                // Only save laps that actually took time
                if (finishedLap.finalTime > 0.5) {
                    setLaps(prev => [...prev, finishedLap]);
                }
            }

            // Reset for new lap
            current.lapNumber = effectiveLap;
            current.startTime = telemetryData.CurrentRaceTime;
            current.startDistance = telemetryData.DistanceTraveled;
            current.checkpoints = [];
            current.points = [];
            current.invalid = false;
            current.lastCheckpointDistance = telemetryData.DistanceTraveled;
            current.gatesCrossed = 0;

            // Find starting gate (skip any gates already behind the car)
            const startX = telemetryData.PositionX;
            const startZ = telemetryData.PositionZ;
            let startGate = 0;
            for (let g = 0; g < trackGates.length; g++) {
                const gate = trackGates[g];
                const dx = startX - gate.center.x;
                const dz = startZ - gate.center.z;
                const dot = dx * gate.normal.x + dz * gate.normal.z;
                if (dot > 0) { startGate = g + 1; continue; }
                break;
            }
            current.nextGateIdx = startGate < trackGates.length ? startGate : 0;
        }

        // Detect pauses or invalidations
        if (telemetryData._gamePaused) {
            current.invalid = true;
        }

        // Record Points for Track Map and Mini-Sectors (every 10 meters)
        const distDriven = telemetryData.DistanceTraveled;
        const relativeDist = distDriven - current.startDistance;

        if (current.points.length === 0 || relativeDist > (current.points[current.points.length - 1].d || 0) + 10) {
            const newPoint = {
                x: telemetryData.PositionX,
                z: telemetryData.PositionZ,
                d: relativeDist,
                time: telemetryData.CurrentLap,
                speed: telemetryData.Speed * 2.23694, // calculate speed in mph for this 10m sector
                brake: telemetryData.Brake || 0,
                accel: telemetryData.Accel || 0,
                steer: telemetryData.Steer || 0,
                gear: telemetryData.Gear || 0,
                rpm: telemetryData.CurrentEngineRpm && telemetryData.EngineMaxRpm
                    ? (telemetryData.CurrentEngineRpm / telemetryData.EngineMaxRpm)
                    : 0
            };

            // ---- GATE TRACKING: Check if we crossed any gates ----
            if (current.points.length > 0) {
                const prevPoint = current.points[current.points.length - 1];
                while (current.nextGateIdx < trackGates.length) {
                    const gate = trackGates[current.nextGateIdx];
                    if (segmentsIntersect(prevPoint, newPoint, gate.p1, gate.p2)) {
                        current.gatesCrossed++;
                        current.nextGateIdx++;
                    } else {
                        break;
                    }
                }
            }

            current.points.push(newPoint);
        }

        // Record Checkpoints (every 500 meters)
        if (distDriven - current.lastCheckpointDistance > 500) {
            current.checkpoints.push({
                distance: distDriven - current.startDistance,
                time: telemetryData.CurrentLap,
                speed: telemetryData.Speed * 2.23694 // mph
            });
            current.lastCheckpointDistance = distDriven;
        }

    }, [telemetryData, currentPlayerName]);

    const clearLaps = () => setLaps([]);

    return { laps, setLaps, clearLaps, livePoints: currentLapRef.current.points };
}

