const dgram = require('dgram');

const client = dgram.createSocket('udp4');
const PORT = 5300;
const HOST = '127.0.0.1';

// Create a buffer of 324 bytes (length of FM7 Dash packet)
const packet = Buffer.alloc(324);

// Mock data
let isRaceOn = 1;
let timestamp = 0;
let rpm = 1000;
let speed = 0;
let gear = 1;
let currLapTime = 0;
let dist = 0;
let speedDir = 1;
let posX = 0;
let posZ = 0;

console.log('Sending mock telemetry...');
setInterval(() => {
    // S32 IsRaceOn (offset 0)
    packet.writeInt32LE(isRaceOn, 0);

    // U32 TimestampMS (offset 4)
    packet.writeUInt32LE(timestamp, 4);

    // F32 EngineMaxRpm (offset 8)
    packet.writeFloatLE(8000, 8);

    // F32 CurrentEngineRpm (offset 16)
    rpm += 50 * speedDir;
    if (rpm > 7500) { gear++; rpm = 4000; }
    if (gear > 6) { gear = 6; speedDir = -1; }
    if (rpm < 2000 && speedDir === -1) { gear--; rpm = 6000; }
    if (gear < 1) { gear = 1; speedDir = 1; }
    packet.writeFloatLE(rpm, 16);

    // Speed (offset 256 assuming standard Dash without padding gap, or whatever it reads)
    // Let's just fill all F32s with 0 and only exact offsets we know for sure are right for testing

    // Instead of exact Dash offsets which might vary, let's just write to the offsets our parser expects.
    // The parser reads Speed at 256 if no padding gap.
    // Wait, my parser reads sequentially. Speed is read after 64 variables (64 * 4 = 256). Wait.
    // PositionX is read at 244 if length >= 324.
    // Let's do it exactly as the parser reads.
    // The parser checks if length >= 324, it reads PositionX at 244.
    packet.writeFloatLE(posX, 244);
    packet.writeFloatLE(0, 248);     // PositionY
    packet.writeFloatLE(posZ, 252);     // PositionZ

    speed += 0.5 * speedDir;
    if (speed < 0) speed = 0;
    packet.writeFloatLE(speed, 256); // Speed

    // Gear is U8 at offset 308
    packet.writeUInt8(gear, 308);

    // LapNumber (offset 302)
    packet.writeUInt16LE(0, 302);

    // CurrentLap (offset 292)
    currLapTime += 100 / 1000; // 10Hz
    packet.writeFloatLE(currLapTime, 292);

    // DistanceTraveled (offset 280)
    dist += speed * 0.1;
    packet.writeFloatLE(dist, 280);

    // Pos
    posX += speed * 0.1;
    posZ += speed * 0.1;

    client.send(packet, 0, packet.length, PORT, HOST, (err) => {
        if (err) console.error(err);
    });

    timestamp += 100;

}, 100);
