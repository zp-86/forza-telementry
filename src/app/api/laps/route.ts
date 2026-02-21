import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SAVE_DIR = path.join(process.cwd(), 'saved_laps');

function ensureDir() {
    if (!fs.existsSync(SAVE_DIR)) {
        fs.mkdirSync(SAVE_DIR, { recursive: true });
    }
}

// GET: List all saved laps
export async function GET() {
    ensureDir();
    const files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.json'));
    const laps = files.map(f => {
        const raw = fs.readFileSync(path.join(SAVE_DIR, f), 'utf-8');
        return JSON.parse(raw);
    });
    return NextResponse.json(laps);
}

// POST: Save a lap
export async function POST(request: Request) {
    ensureDir();
    const lap = await request.json();
    if (!lap.id) {
        return NextResponse.json({ error: 'Missing lap id' }, { status: 400 });
    }
    const filename = `${lap.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    fs.writeFileSync(path.join(SAVE_DIR, filename), JSON.stringify(lap, null, 2));
    return NextResponse.json({ ok: true });
}

// DELETE: Remove a saved lap
export async function DELETE(request: Request) {
    ensureDir();
    const { id } = await request.json();
    if (!id) {
        return NextResponse.json({ error: 'Missing lap id' }, { status: 400 });
    }
    const filename = `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const filepath = path.join(SAVE_DIR, filename);
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }
    return NextResponse.json({ ok: true });
}
