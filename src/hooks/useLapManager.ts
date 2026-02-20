import { useState, useEffect, useRef } from 'react';

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
    points: { x: number, z: number }[]; // driving line
}

export function useLapManager(telemetryData: any, currentPlayerName: string) {
    const [laps, setLaps] = useState<LapData[]>([]);

    // Mutable refs to track current lap state without causing endless re-renders
    const currentLapRef = useRef<{
        lapNumber: number;
        startTime: number;
        startDistance: number;
        checkpoints: Checkpoint[];
        points: { x: number, z: number }[];
        invalid: boolean;
        lastCheckpointDistance: number;
    }>({
        lapNumber: -1,
        startTime: 0,
        startDistance: 0,
        checkpoints: [],
        points: [],
        invalid: false,
        lastCheckpointDistance: -1,
    });

    useEffect(() => {
        if (!telemetryData || telemetryData.IsRaceOn === 0) return;

        const current = currentLapRef.current;

        // Detect new lap
        if (telemetryData.LapNumber !== current.lapNumber) {
            if (current.lapNumber !== -1 && !current.invalid) {
                // Save previous lap. LastLap in telemetry is updated by game
                const finishedLap: LapData = {
                    id: `${current.lapNumber}-${Date.now()}`,
                    lapNumber: current.lapNumber,
                    playerName: currentPlayerName,
                    finalTime: telemetryData.LastLap || 0,
                    checkpoints: [...current.checkpoints],
                    invalid: current.invalid,
                    points: [...current.points],
                };
                // Don't save 0 time laps 
                if (finishedLap.finalTime > 0) {
                    setLaps(prev => [...prev, finishedLap]);
                }
            }

            // Reset for new lap
            current.lapNumber = telemetryData.LapNumber;
            current.startTime = telemetryData.CurrentRaceTime;
            current.startDistance = telemetryData.DistanceTraveled;
            current.checkpoints = [];
            current.points = [];
            current.invalid = false;
            current.lastCheckpointDistance = telemetryData.DistanceTraveled;
        }

        // Detect pauses or invalidations
        if (telemetryData._gamePaused) {
            current.invalid = true;
        }

        // Heuristic for Off Track (using rumble strips and puddle combined as a proxy if it gets extreme, or just user requests it later)
        // For now we just check if it was paused.

        // Record Points for Track Map (throttle to avoid massive arrays, e.g. every 10 meters)
        const distDriven = telemetryData.DistanceTraveled;
        if (current.points.length === 0 || distDriven > current.points[current.points.length - 1].d + 10) {
            current.points.push({ x: telemetryData.PositionX, z: telemetryData.PositionZ, d: distDriven } as any);
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

    return { laps, clearLaps };
}
