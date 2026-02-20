import { LapData } from "@/hooks/useLapManager";
import { Clock, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { useState } from "react";

export function LapHistory({
    laps,
    onCompare
}: {
    laps: LapData[],
    onCompare: (lap1: LapData, lap2: LapData) => void
}) {
    const [selectedLaps, setSelectedLaps] = useState<string[]>([]);

    const handleSelect = (lapId: string) => {
        setSelectedLaps(prev => {
            if (prev.includes(lapId)) return prev.filter(id => id !== lapId);
            if (prev.length >= 2) return [prev[1], lapId];
            return [...prev, lapId];
        });
    };

    const handleCompareClick = () => {
        if (selectedLaps.length === 2) {
            const l1 = laps.find(l => l.id === selectedLaps[0]);
            const l2 = laps.find(l => l.id === selectedLaps[1]);
            if (l1 && l2) onCompare(l1, l2);
        }
    };

    // Group by player
    const players = Array.from(new Set(laps.map(l => l.playerName)));

    const formatTime = (seconds: number) => {
        if (!seconds) return "-";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    // Find overall best lap to calculate deltas
    const bestOverallLapTime = laps.filter(l => !l.invalid).reduce((min, l) => l.finalTime < min ? l.finalTime : min, Infinity);

    return (
        <div className="flex flex-col h-full opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-neutral-400 uppercase tracking-widest text-xs font-bold">Lap History</h2>

                <button
                    onClick={handleCompareClick}
                    disabled={selectedLaps.length !== 2}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-widest flex items-center gap-2 transition-all ${selectedLaps.length === 2
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]'
                            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        }`}
                >
                    <ArrowRightLeft className="w-4 h-4" />
                    Compare Laps
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar">
                {players.length === 0 && (
                    <div className="text-center py-8 text-neutral-600 text-sm tracking-widest">
                        No completed laps yet.
                    </div>
                )}

                {players.map(player => (
                    <div key={player} className="space-y-2">
                        <h3 className="text-indigo-400 font-bold text-sm border-b border-neutral-800 pb-1 flex items-center gap-2">
                            {player}
                            <span className="text-neutral-600 text-xs font-normal">
                                ({laps.filter(l => l.playerName === player).length} laps)
                            </span>
                        </h3>

                        <div className="space-y-2">
                            {laps.filter(l => l.playerName === player).map(lap => {
                                const isSelected = selectedLaps.includes(lap.id);
                                const isBest = lap.finalTime === bestOverallLapTime && !lap.invalid;

                                return (
                                    <div
                                        key={lap.id}
                                        onClick={() => handleSelect(lap.id)}
                                        className={`
                      flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none
                      ${isSelected
                                                ? 'bg-indigo-900/40 border-indigo-500/50 scale-[1.02]'
                                                : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800 hover:border-neutral-700'
                                            }
                    `}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-400 text-xs">
                                                {lap.lapNumber}
                                            </div>

                                            {lap.invalid && (
                                                <div title="Invalid Lap (Paused/Off Track)">
                                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                                </div>
                                            )}

                                            {isBest && (
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                    Fastest
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-right">
                                            <div className="font-mono text-lg font-bold tracking-tight flex items-center justify-end gap-2">
                                                <Clock className="w-3 h-3 text-neutral-500" />
                                                {lap.invalid ? (
                                                    <span className="text-neutral-500 line-through">{formatTime(lap.finalTime)}</span>
                                                ) : (
                                                    <span className={isBest ? 'text-emerald-400' : 'text-white'}>
                                                        {formatTime(lap.finalTime)}
                                                    </span>
                                                )}
                                            </div>

                                            {!lap.invalid && !isBest && lap.finalTime > 0 && bestOverallLapTime !== Infinity && (
                                                <div className="text-xs font-mono text-red-400/80">
                                                    +{formatTime(lap.finalTime - bestOverallLapTime)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
