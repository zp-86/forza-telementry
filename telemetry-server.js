const dgram = require('dgram');
const { WebSocketServer } = require('ws');

const UDP_PORT = 5300;
const WS_PORT = 5301;
const BROADCAST_HZ = 30;
let lastBroadcastTime = 0;

const server = dgram.createSocket('udp4');
const wss = new WebSocketServer({ port: WS_PORT });

console.log(`[Telemetry] Starting telemetry server...`);

// Forza Motorsport 2023 / FM7 Dash packet layout:
// Sled section: 232 bytes (58 fields * 4 bytes each)
// If packet is 324 bytes → there's a 12-byte gap (padding) before Dash extras at offset 244
// If packet is 311 bytes → Dash extras start right after Sled at offset 232
// Dash extras: PositionX..TrackOrdinal

function parseDashPacket(buf) {
    // Determine whether we have the 12-byte padding variant
    const hasPadding = buf.length >= 324;
    const dashStart = hasPadding ? 244 : 232;

    // Read Sled section at fixed offsets
    const sled = {
        IsRaceOn: buf.readInt32LE(0),
        TimestampMS: buf.readUInt32LE(4),
        EngineMaxRpm: buf.readFloatLE(8),
        EngineIdleRpm: buf.readFloatLE(12),
        CurrentEngineRpm: buf.readFloatLE(16),
        AccelerationX: buf.readFloatLE(20),
        AccelerationY: buf.readFloatLE(24),
        AccelerationZ: buf.readFloatLE(28),
        VelocityX: buf.readFloatLE(32),
        VelocityY: buf.readFloatLE(36),
        VelocityZ: buf.readFloatLE(40),
        AngularVelocityX: buf.readFloatLE(44),
        AngularVelocityY: buf.readFloatLE(48),
        AngularVelocityZ: buf.readFloatLE(52),
        Yaw: buf.readFloatLE(56),
        Pitch: buf.readFloatLE(60),
        Roll: buf.readFloatLE(64),
        NormalizedSuspensionTravelFL: buf.readFloatLE(68),
        NormalizedSuspensionTravelFR: buf.readFloatLE(72),
        NormalizedSuspensionTravelRL: buf.readFloatLE(76),
        NormalizedSuspensionTravelRR: buf.readFloatLE(80),
        TireSlipRatioFL: buf.readFloatLE(84),
        TireSlipRatioFR: buf.readFloatLE(88),
        TireSlipRatioRL: buf.readFloatLE(92),
        TireSlipRatioRR: buf.readFloatLE(96),
        WheelRotationSpeedFL: buf.readFloatLE(100),
        WheelRotationSpeedFR: buf.readFloatLE(104),
        WheelRotationSpeedRL: buf.readFloatLE(108),
        WheelRotationSpeedRR: buf.readFloatLE(112),
        WheelOnRumbleStripFL: buf.readInt32LE(116),
        WheelOnRumbleStripFR: buf.readInt32LE(120),
        WheelOnRumbleStripRL: buf.readInt32LE(124),
        WheelOnRumbleStripRR: buf.readInt32LE(128),
        WheelInPuddleDepthFL: buf.readFloatLE(132),
        WheelInPuddleDepthFR: buf.readFloatLE(136),
        WheelInPuddleDepthRL: buf.readFloatLE(140),
        WheelInPuddleDepthRR: buf.readFloatLE(144),
        SurfaceRumbleFL: buf.readFloatLE(148),
        SurfaceRumbleFR: buf.readFloatLE(152),
        SurfaceRumbleRL: buf.readFloatLE(156),
        SurfaceRumbleRR: buf.readFloatLE(160),
        TireSlipAngleFL: buf.readFloatLE(164),
        TireSlipAngleFR: buf.readFloatLE(168),
        TireSlipAngleRL: buf.readFloatLE(172),
        TireSlipAngleRR: buf.readFloatLE(176),
        TireCombinedSlipFL: buf.readFloatLE(180),
        TireCombinedSlipFR: buf.readFloatLE(184),
        TireCombinedSlipRL: buf.readFloatLE(188),
        TireCombinedSlipRR: buf.readFloatLE(192),
        SuspensionTravelMetersFL: buf.readFloatLE(196),
        SuspensionTravelMetersFR: buf.readFloatLE(200),
        SuspensionTravelMetersRL: buf.readFloatLE(204),
        SuspensionTravelMetersRR: buf.readFloatLE(208),
        CarOrdinal: buf.readInt32LE(212),
        CarClass: buf.readInt32LE(216),
        CarPerformanceIndex: buf.readInt32LE(220),
        DrivetrainType: buf.readInt32LE(224),
        NumCylinders: buf.readInt32LE(228),
    };

    // If packet is Sled-only (232 bytes), return just sled
    if (buf.length < 300) {
        return sled;
    }

    // Dash extras start at dashStart
    let o = dashStart;
    const dash = {
        PositionX: buf.readFloatLE(o),      // o+0
        PositionY: buf.readFloatLE(o + 4),   // o+4
        PositionZ: buf.readFloatLE(o + 8),   // o+8
        Speed: buf.readFloatLE(o + 12),  // o+12
        Power: buf.readFloatLE(o + 16),  // o+16
        Torque: buf.readFloatLE(o + 20),  // o+20
        TireTempFL: buf.readFloatLE(o + 24),
        TireTempFR: buf.readFloatLE(o + 28),
        TireTempRL: buf.readFloatLE(o + 32),
        TireTempRR: buf.readFloatLE(o + 36),
        Boost: buf.readFloatLE(o + 40),
        Fuel: buf.readFloatLE(o + 44),
        DistanceTraveled: buf.readFloatLE(o + 48),
        BestLap: buf.readFloatLE(o + 52),
        LastLap: buf.readFloatLE(o + 56),
        CurrentLap: buf.readFloatLE(o + 60),
        CurrentRaceTime: buf.readFloatLE(o + 64),
        LapNumber: buf.readUInt16LE(o + 68),
        RacePosition: buf.readUInt8(o + 70),
        Accel: buf.readUInt8(o + 71),
        Brake: buf.readUInt8(o + 72),
        Clutch: buf.readUInt8(o + 73),
        HandBrake: buf.readUInt8(o + 74),
        Gear: buf.readUInt8(o + 75),
        Steer: buf.readInt8(o + 76),
        NormalizedDrivingLine: buf.readInt8(o + 77),
        NormalizedAIBrakeDifference: buf.readInt8(o + 78),
    };

    // TireWear + TrackOrdinal (after 1 byte alignment padding at o+79)
    const wearStart = o + 80; // aligned to 4-byte boundary
    let extras = {};
    if (buf.length >= wearStart + 20) {
        extras = {
            TireWearFL: buf.readFloatLE(wearStart),
            TireWearFR: buf.readFloatLE(wearStart + 4),
            TireWearRL: buf.readFloatLE(wearStart + 8),
            TireWearRR: buf.readFloatLE(wearStart + 12),
            TrackOrdinal: buf.readInt32LE(wearStart + 16),
        };
    }

    return { ...sled, ...dash, ...extras };
}

let clients = [];

wss.on('connection', (ws) => {
    console.log('[Telemetry] Frontend connected to WebSocket.');
    clients.push(ws);
    ws.on('close', () => {
        clients = clients.filter((c) => c !== ws);
    });
});

let isReceiving = false;
server.on('message', (msg, rinfo) => {
    if (!isReceiving) {
        console.log(`[Telemetry] Receiving data from Forza on ${rinfo.address}:${rinfo.port} (Packet size: ${msg.length} bytes)`);
        isReceiving = true;
    }

    const now = Date.now();
    if (now - lastBroadcastTime < (1000 / BROADCAST_HZ)) return;
    lastBroadcastTime = now;

    try {
        if (msg.length < 232) return;

        const telemetry = parseDashPacket(msg);

        if (telemetry.IsRaceOn === 0) {
            telemetry._gamePaused = true;
        }

        const payload = JSON.stringify(telemetry);
        for (const ws of clients) {
            if (ws.readyState === 1) ws.send(payload);
        }
    } catch (e) {
        console.error("[Telemetry] Error parsing packet", e.message);
    }
});

server.on('listening', () => {
    const address = server.address();
    console.log(`[Telemetry] UDP Socket listening on ${address.address}:${address.port}`);
    console.log(`[Telemetry] WebSocket server listening on port ${WS_PORT}`);
});

server.bind(UDP_PORT, '127.0.0.1');
