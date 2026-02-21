// Generates a realistic fake lap by driving around an oval-ish circuit.
// This runs entirely in the browser — no UDP needed.

export interface MockPacket {
    IsRaceOn: number;
    TimestampMS: number;
    EngineMaxRpm: number;
    EngineIdleRpm: number;
    CurrentEngineRpm: number;
    AccelerationX: number;
    AccelerationY: number;
    AccelerationZ: number;
    VelocityX: number;
    VelocityY: number;
    VelocityZ: number;
    AngularVelocityX: number;
    AngularVelocityY: number;
    AngularVelocityZ: number;
    Yaw: number;
    Pitch: number;
    Roll: number;
    Speed: number;
    Power: number;
    Torque: number;
    Boost: number;
    Fuel: number;
    DistanceTraveled: number;
    BestLap: number;
    LastLap: number;
    CurrentLap: number;
    CurrentRaceTime: number;
    LapNumber: number;
    RacePosition: number;
    Accel: number;
    Brake: number;
    Gear: number;
    Steer: number;
    PositionX: number;
    PositionY: number;
    PositionZ: number;
    CarOrdinal: number;
    TrackOrdinal: number;
    _gamePaused?: boolean;
    // Simplified — we don't populate every field for the mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

// Generate a circuit shaped like a rounded rectangle / race track
function generateCircuitPoints(numPoints: number): { x: number; z: number; yaw: number }[] {
    const points: { x: number; z: number; yaw: number }[] = [];

    // Parameters for a rounded-rectangle circuit
    const straightLen = 600;  // length of straight sections
    const cornerRadius = 200; // radius of corners
    const totalPerimeter = 2 * straightLen + 2 * Math.PI * cornerRadius;

    for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * totalPerimeter;
        let x = 0, z = 0, yaw = 0;

        // Bottom straight (left to right)
        if (t < straightLen) {
            x = t;
            z = 0;
            yaw = 0;
        }
        // Right semicircle
        else if (t < straightLen + Math.PI * cornerRadius) {
            const angle = (t - straightLen) / cornerRadius;
            x = straightLen + Math.sin(angle) * cornerRadius;
            z = cornerRadius - Math.cos(angle) * cornerRadius;
            yaw = angle;
        }
        // Top straight (right to left)
        else if (t < 2 * straightLen + Math.PI * cornerRadius) {
            const along = t - straightLen - Math.PI * cornerRadius;
            x = straightLen - along;
            z = 2 * cornerRadius;
            yaw = Math.PI;
        }
        // Left semicircle
        else {
            const angle = (t - 2 * straightLen - Math.PI * cornerRadius) / cornerRadius;
            x = -Math.sin(angle) * cornerRadius;
            z = cornerRadius + Math.cos(angle) * cornerRadius;
            yaw = Math.PI + angle;
        }

        points.push({ x, z, yaw });
    }

    return points;
}

export function runMockLap(
    onPacket: (packet: MockPacket) => void,
    onComplete: () => void,
): () => void {
    const FPS = 30;
    const LAP_DURATION_S = 65; // ~65 seconds for a lap
    const totalFrames = FPS * LAP_DURATION_S;
    const circuitPoints = generateCircuitPoints(totalFrames);

    let frame = 0;
    let cancelled = false;
    let distanceTraveled = 0;

    const interval = setInterval(() => {
        if (cancelled) {
            clearInterval(interval);
            return;
        }

        const currentLapFrame = frame % totalFrames;
        const lapNumber = Math.floor(frame / totalFrames);

        // When we cycle back to the start of a new lap
        if (lapNumber > 0 && currentLapFrame === 0) {
            // "cross the line"
            // Reset distance traveled for realistic loop? It actually keeps counting up continuously in game.
            // But LastLap updates.
        }

        const pt = circuitPoints[currentLapFrame];
        const prevPt = currentLapFrame > 0 ? circuitPoints[currentLapFrame - 1] : pt;
        const dx = pt.x - prevPt.x;
        const dz = pt.z - prevPt.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        distanceTraveled += dist;

        // Simulate varying speed: faster on straights, slower on corners
        const turnRate = frame > 0
            ? Math.abs(pt.yaw - prevPt.yaw)
            : 0;
        const speedMps = turnRate < 0.02 ? 65 + Math.random() * 5 : 35 + Math.random() * 5; // m/s

        const timeInLap = frame / FPS;
        const rpm = turnRate < 0.02
            ? 6000 + Math.random() * 1500
            : 4000 + Math.random() * 1000;
        const gear = speedMps > 55 ? 6 : speedMps > 45 ? 5 : speedMps > 35 ? 4 : 3;

        const packet: MockPacket = {
            IsRaceOn: 1,
            TimestampMS: frame * (1000 / FPS),
            EngineMaxRpm: 8500,
            EngineIdleRpm: 800,
            CurrentEngineRpm: rpm,
            AccelerationX: 0,
            AccelerationY: 0,
            AccelerationZ: 0,
            VelocityX: dx * FPS,
            VelocityY: 0,
            VelocityZ: dz * FPS,
            AngularVelocityX: 0,
            AngularVelocityY: 0,
            AngularVelocityZ: 0,
            Yaw: pt.yaw,
            Pitch: 0,
            Roll: 0,
            Speed: speedMps,
            Power: 250000,
            Torque: 400,
            Boost: 0,
            Fuel: 1.0 - (frame / totalFrames) * 0.1,
            DistanceTraveled: distanceTraveled,
            BestLap: lapNumber > 0 ? LAP_DURATION_S : 0,
            LastLap: lapNumber > 0 ? LAP_DURATION_S : 0,
            CurrentLap: currentLapFrame / FPS,
            CurrentRaceTime: frame / FPS,
            LapNumber: lapNumber,
            RacePosition: 1,
            Accel: turnRate < 0.02 ? 255 : 180,
            Brake: turnRate > 0.03 ? 100 : 0,
            Gear: gear,
            Steer: Math.round(turnRate * 50),
            PositionX: pt.x,
            PositionY: 0,
            PositionZ: pt.z,
            CarOrdinal: 1234,
            TrackOrdinal: 100,
        };

        onPacket(packet);
        frame++;
    }, 1000 / FPS);

    // Return a cancel function
    return () => {
        cancelled = true;
        clearInterval(interval);
    };
}
