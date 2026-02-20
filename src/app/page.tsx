"use client";

import { useState, useRef, useCallback } from "react";
import { useTelemetry, ConnectionState } from "@/hooks/useTelemetry";
import { useLapManager, LapData } from "@/hooks/useLapManager";
import { Activity, User, Play, Square, Wifi, WifiOff, Gamepad2 } from "lucide-react";
import { TrackMap } from "@/components/TrackMap";
import { LapHistory } from "@/components/LapHistory";
import { LapComparison } from "@/components/LapComparison";
import { runMockLap } from "@/lib/mockLap";

export default function Home() {
  const { data, connectionState, injectData } = useTelemetry();

  const [playerName, setPlayerName] = useState("Player 1");
  const [comparingLaps, setComparingLaps] = useState<[LapData, LapData] | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const cancelMockRef = useRef<(() => void) | null>(null);

  const { laps } = useLapManager(data, playerName);

  const getSpeedMPH = (speedMs: number) => {
    return Math.round(Math.max(0, speedMs * 2.23694));
  };

  const getRPM = (current: number, max: number) => {
    if (!current || !max) return 0;
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

  // Use the first completed lap as the reference track outline
  const referenceLine = laps.length > 0 ? laps[0].points : [];

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6 font-sans relative overflow-x-hidden">

      {comparingLaps && (
        <LapComparison
          lap1={comparingLaps[0]}
          lap2={comparingLaps[1]}
          onClose={() => setComparingLaps(null)}
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
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <svg viewBox="0 0 100 100" className="w-48 h-48 fill-current text-white"><path d="M50 0 L100 25 L100 75 L50 100 L0 75 L0 25 Z" /></svg>
            </div>
            <h2 className="text-neutral-400 uppercase tracking-widest text-xs font-bold mb-6">Live Telemetry</h2>

            <div className="flex flex-col items-center justify-center my-8">
              <div className="text-7xl font-light tabular-nums tracking-tighter">
                {data ? getSpeedMPH(data.Speed) : "0"}
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
                <div className="text-3xl font-bold">{data?.Gear === 0 ? "R" : data?.Gear || "N"}</div>
              </div>
              <div className="bg-neutral-800/50 p-4 rounded-xl">
                <div className="text-neutral-500 text-xs font-bold uppercase tracking-wider mb-1">Lap</div>
                <div className="text-3xl font-bold">{data ? data.LapNumber + 1 : "-"}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 border border-neutral-800 bg-neutral-900/50 backdrop-blur-md rounded-2xl p-6 shadow-xl overflow-hidden min-h-0">
            <LapHistory laps={laps} onCompare={handleCompare} />
          </div>

        </div>

        {/* Right Column - Track Map */}
        <div className="col-span-1 lg:col-span-3 border border-neutral-800 bg-neutral-900/50 backdrop-blur-md rounded-2xl shadow-xl flex flex-col overflow-hidden relative">
          <TrackMap
            currentX={data?.PositionX}
            currentZ={data?.PositionZ}
            carYaw={data?.Yaw}
            historicalLines={laps.map(l => l.points)}
            referenceLine={referenceLine}
          />
        </div>

      </div>

    </main>
  );
}
