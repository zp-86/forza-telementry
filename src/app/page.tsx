"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTelemetry, ConnectionState } from "@/hooks/useTelemetry";
import { useLapManager, LapData } from "@/hooks/useLapManager";
import { Activity, User, Play, Square, Wifi, WifiOff, Gamepad2 } from "lucide-react";
import { TrackMap } from "@/components/TrackMap";
import { LapHistory } from "@/components/LapHistory";
import { LapComparison } from "@/components/LapComparison";
import { LiveCharts } from "@/components/LiveCharts";
import { runMockLap } from "@/lib/mockLap";
import referenceLineData from "@/lib/reference_line.json";
import trackGates from "@/lib/gates.json";

export default function Home() {
  const { data, connectionState, injectData } = useTelemetry();

  const [playerName, setPlayerName] = useState("Player 1");
  const [comparingLaps, setComparingLaps] = useState<[LapData, LapData] | null>(null);
  const [viewingLap, setViewingLap] = useState<LapData | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const cancelMockRef = useRef<(() => void) | null>(null);
  const [hiddenLapIds, setHiddenLapIds] = useState<Set<string>>(new Set());
  const [savedLapIds, setSavedLapIds] = useState<Set<string>>(new Set());
  const [dynamicZoom, setDynamicZoom] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'charts'>('map');

  const { laps, setLaps, livePoints } = useLapManager(data, playerName);

  // Don't pass 0,0 position to TrackMap (game is paused)
  const carX = data?.PositionX !== 0 || data?.PositionZ !== 0 ? data?.PositionX : undefined;
  const carZ = data?.PositionX !== 0 || data?.PositionZ !== 0 ? data?.PositionZ : undefined;

  // Visibility: default is ALL visible. We only track hidden laps.

  // Load saved laps on mount
  useEffect(() => {
    fetch('/api/laps')
      .then(res => res.json())
      .then((savedLaps: LapData[]) => {
        if (savedLaps.length > 0) {
          setLaps(prev => {
            const existingIds = new Set(prev.map(l => l.id));
            const newLaps = savedLaps.filter(l => !existingIds.has(l.id));
            return newLaps.length > 0 ? [...prev, ...newLaps] : prev;
          });
          setSavedLapIds(new Set(savedLaps.map(l => l.id)));
        }
      })
      .catch(() => { /* silently fail if API not available */ });
  }, [setLaps]);

  const handleSave = async (lap: LapData) => {
    try {
      await fetch('/api/laps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lap),
      });
      setSavedLapIds(prev => new Set([...prev, lap.id]));
    } catch (e) {
      console.error('Failed to save lap:', e);
    }
  };

  const handleDelete = async (lapId: string) => {
    try {
      await fetch('/api/laps', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lapId }),
      });
      setSavedLapIds(prev => {
        const next = new Set(prev);
        next.delete(lapId);
        return next;
      });
    } catch (e) {
      console.error('Failed to delete lap:', e);
    }
  };

  const handleToggleVisibility = (lapId: string) => {
    setHiddenLapIds(prev => {
      const next = new Set(prev);
      if (next.has(lapId)) next.delete(lapId);
      else next.add(lapId);
      return next;
    });
  };

  const handleTogglePlayerVisibility = (playerName: string, isVisible: boolean) => {
    setHiddenLapIds(prev => {
      const next = new Set(prev);
      laps.filter(l => l.playerName === playerName).forEach(l => {
        if (isVisible) next.delete(l.id);
        else next.add(l.id);
      });
      return next;
    });
  };

  const getSpeedMPH = (speedMs: number | undefined, vx: number, vy: number, vz: number) => {
    if (typeof speedMs === 'number' && !isNaN(speedMs)) {
      return Math.round(Math.max(0, speedMs * 2.23694));
    }
    if (typeof vx === 'number' && typeof vy === 'number' && typeof vz === 'number') {
      const spd = Math.sqrt(vx * vx + vy * vy + vz * vz);
      return Math.round(Math.max(0, spd * 2.23694));
    }
    return 0;
  };

  const getRPM = (current: number, max: number) => {
    if (typeof current !== 'number' || typeof max !== 'number' || max === 0 || isNaN(current) || isNaN(max)) return 0;
    return Math.round((current / max) * 100);
  };

  const handleCompare = (lap1: LapData, lap2: LapData) => {
    setComparingLaps([lap1, lap2]);
  };

  const startTestLap = useCallback(() => {
    setTestRunning(true);
    cancelMockRef.current = runMockLap(
      (packet) => injectData(packet),
      () => setTestRunning(false),
    );
  }, [injectData]);

  const stopTestLap = useCallback(() => {
    if (cancelMockRef.current) {
      cancelMockRef.current();
      cancelMockRef.current = null;
    }
    setTestRunning(false);
  }, []);

  // Connection status info
  const connectionInfo: Record<ConnectionState, { dot: string; label: string; icon: React.ReactNode }> = {
    "disconnected": {
      dot: "bg-red-500 animate-pulse",
      label: "Server Offline",
      icon: <WifiOff className="w-4 h-4 text-red-400" />,
    },
    "server-only": {
      dot: "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.6)]",
      label: "Server Connected · Game Not Detected",
      icon: <Wifi className="w-4 h-4 text-yellow-400" />,
    },
    "game-active": {
      dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]",
      label: "Game Connected",
      icon: <Gamepad2 className="w-4 h-4 text-emerald-400" />,
    },
  };

  const connInfo = connectionInfo[connectionState];
  const showTestButton = connectionState !== "game-active" && !testRunning;

  // Filter historicalLines by visibility (show all except hidden)
  const visibleLapIds = new Set(laps.filter(l => !hiddenLapIds.has(l.id)).map(l => l.id));
  const visibleLines = laps.filter(l => !hiddenLapIds.has(l.id)).map(l => l.points);

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6 font-sans relative overflow-x-hidden">

      {(comparingLaps || viewingLap) && (
        <LapComparison
          baseLap={comparingLaps ? comparingLaps[0] : undefined}
          compLap={comparingLaps ? comparingLaps[1] : viewingLap!}
          isSingleView={!!viewingLap}
          onClose={() => {
            setComparingLaps(null);
            setViewingLap(null);
          }}
        />
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-indigo-500" />
          <h1 className="text-2xl font-bold tracking-tight">Forza Telemetry</h1>
        </div>

        <div className="flex items-center gap-5">
          {/* Player Name */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg">
            <User className="w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-bold w-24 focus:w-32 transition-all placeholder-neutral-600"
              placeholder="Player Name"
            />
          </div>

          {/* Test Button */}
          {showTestButton && (
            <button
              onClick={startTestLap}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold tracking-wide transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)]"
            >
              <Play className="w-4 h-4" />
              Test Lap
            </button>
          )}
          {testRunning && (
            <button
              onClick={stopTestLap}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold tracking-wide transition-all animate-pulse"
            >
              <Square className="w-4 h-4" />
              Stop Test
            </button>
          )}

          {/* Connection Status */}
          <div className="flex items-center gap-2 bg-neutral-900/50 border border-neutral-800 px-3 py-1.5 rounded-lg">
            {connInfo.icon}
            <div className={`w-2.5 h-2.5 rounded-full ${connInfo.dot}`} />
            <span className="text-xs tracking-wider uppercase text-neutral-400 font-semibold">
              {connInfo.label}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-120px)]">

        {/* Left Column - Live Stats & Laps */}
        <div className="col-span-1 flex flex-col gap-6">

          <div className="flex-none border border-neutral-800 bg-neutral-900/50 backdrop-blur-md rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <h2 className="text-neutral-400 uppercase tracking-widest text-xs font-bold mb-6">Live Telemetry</h2>

            <div className="flex flex-col items-center justify-center my-8">
              <div className="text-7xl font-light tabular-nums tracking-tighter">
                {data ? getSpeedMPH(data.Speed, data.VelocityX, data.VelocityY, data.VelocityZ) : "0"}
              </div>
              <div className="text-neutral-500 tracking-widest font-bold mt-1">MPH</div>
            </div>

            <div className="flex items-center justify-between px-2 text-sm text-neutral-400 font-bold mb-2">
              <span>RPM</span>
              <span className="tabular-nums">{data ? Math.round(data.CurrentEngineRpm) : "0"}</span>
            </div>
            <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden mb-8 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500 transition-all duration-75"
                style={{ width: `${data ? getRPM(data.CurrentEngineRpm, data.EngineMaxRpm) : 0}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-neutral-800/50 p-4 rounded-xl">
                <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Gear</div>
                <div className="text-3xl font-bold">{data?.Gear === 0 ? "R" : (typeof data?.Gear === 'number' && !isNaN(data.Gear) ? data.Gear : "N")}</div>
              </div>
              <div className="bg-neutral-800/50 p-4 rounded-xl">
                <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Lap</div>
                <div className="text-3xl font-bold">{data && typeof data.LapNumber === 'number' && !isNaN(data.LapNumber) ? data.LapNumber + 1 : "-"}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 border border-neutral-800 bg-neutral-900/50 backdrop-blur-md rounded-2xl p-6 shadow-xl overflow-hidden min-h-0">
            <LapHistory
              laps={laps}
              currentLapNumber={data?.LapNumber}
              currentLapTime={data?.CurrentLap}
              onCompare={handleCompare}
              onView={(lap) => setViewingLap(lap)}
              onSave={handleSave}
              onDelete={handleDelete}
              visibleLapIds={visibleLapIds}
              onToggleVisibility={handleToggleVisibility}
              onTogglePlayerVisibility={handleTogglePlayerVisibility}
              savedLapIds={savedLapIds}
            />
          </div>

        </div>

        {/* Right Column - Track Map */}
        <div className="col-span-1 lg:col-span-3 border border-neutral-800 bg-neutral-900/50 backdrop-blur-md rounded-2xl shadow-xl flex flex-col overflow-hidden relative">

          {/* View Toggle */}
          <div className="absolute top-4 right-4 z-30 flex gap-2 bg-neutral-950/80 backdrop-blur-md p-1 rounded-lg border border-neutral-800">
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${viewMode === 'map' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Map
            </button>
            <button
              onClick={() => setViewMode('charts')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${viewMode === 'charts' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Live Charts
            </button>
          </div>

          {viewMode === 'map' ? (
            <>
              {data && data.PositionX === undefined ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-neutral-900/80 z-20 backdrop-blur-sm">
                  <h3 className="text-xl font-bold text-neutral-200 mb-2">Extended Telemetry Unavailable</h3>
                  <p className="text-neutral-400 text-sm max-w-md leading-relaxed">Your game is sending &quot;Sled&quot; telemetry format which lacks position and lap data. Please change the <strong>Data Out Packet Format</strong> to <strong>&quot;Dash&quot;</strong> in Forza settings to see the map and track lap history.</p>
                </div>
              ) : null}
              <TrackMap
                currentX={carX}
                currentZ={carZ}
                carYaw={data?.Yaw}
                historicalLines={visibleLines}
                referenceLine={referenceLineData}
                gates={trackGates}
                dynamicZoom={dynamicZoom}
                onToggleDynamicZoom={() => setDynamicZoom(p => !p)}
              />
            </>
          ) : (
            <div className="flex-1 w-full h-full p-4 pt-16">
              <LiveCharts points={livePoints} />
            </div>
          )}
        </div>

      </div>

    </main>
  );
}
