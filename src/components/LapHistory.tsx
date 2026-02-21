import { LapData } from "@/hooks/useLapManager";
import { Clock, AlertTriangle, ArrowRightLeft, Map, MoreVertical, Download, Save, Trash2, Eye, EyeOff } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function LapHistory({
    laps,
    currentLapNumber,
    currentLapTime,
    onCompare,
    onView,
    onSave,
    onDelete,
    visibleLapIds,
    onToggleVisibility,
    onTogglePlayerVisibility,
    savedLapIds,
}: {
    laps: LapData[],
    currentLapNumber?: number,
    currentLapTime?: number,
    onCompare: (lap1: LapData, lap2: LapData) => void,
    onView: (lap: LapData) => void,
    onSave?: (lap: LapData) => Promise<void>,
    onDelete?: (lapId: string) => Promise<void>,
    visibleLapIds?: Set<string>,
    onToggleVisibility?: (lapId: string) => void,
    onTogglePlayerVisibility?: (playerName: string, isVisible: boolean) => void,
    savedLapIds?: Set<string>,
}) {
    const [selectedLaps, setSelectedLaps] = useState<string[]>([]);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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

    const handleExport = (lap: LapData) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lap.points, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `forza_track_mapping_lap_${lap.lapNumber}.json`;
        a.click();
        setOpenMenu(null);
    };

    return (
        <div className="flex flex-col h-full">
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
                {players.length === 0 && (currentLapNumber === undefined || currentLapNumber < 0) && (
                    <div className="text-center py-8 text-neutral-600 text-sm tracking-widest">
                        No laps recorded yet.
                    </div>
                )}

                {/* Active Lap */}
                {currentLapNumber !== undefined && currentLapNumber >= 0 && (
                    <div className="space-y-2 mb-6">
                        <h3 className="text-emerald-400/80 font-bold text-sm border-b border-neutral-800 pb-1 flex items-center gap-2">
                            Active Lap
                            <span className="text-neutral-600 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                                Underway
                            </span>
                        </h3>
                        <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-900/30 bg-emerald-900/10 shadow-inner">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-emerald-900/50 text-emerald-400 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-500/30">
                                    {currentLapNumber}
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 animate-[pulse_2s_ease-in-out_infinite]">
                                    Driving...
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-lg font-bold tracking-tight flex items-center justify-end gap-2 text-white">
                                    <Clock className="w-3 h-3 text-emerald-500" />
                                    {formatTime(currentLapTime || 0)}
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mt-1 opacity-50">
                                    Awaiting Finish
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {players.map(player => {
                    const playerLaps = laps.filter(l => l.playerName === player);
                    const allVisible = playerLaps.every(l => visibleLapIds ? visibleLapIds.has(l.id) : true);

                    return (
                        <div key={player} className="space-y-2">
                            <div className="flex justify-between items-center border-b border-neutral-800 pb-1">
                                <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2">
                                    {player}
                                    <span className="text-neutral-600 text-xs font-normal">
                                        ({playerLaps.length} laps)
                                    </span>
                                </h3>
                                {onTogglePlayerVisibility && (
                                    <button
                                        onClick={() => onTogglePlayerVisibility(player, !allVisible)}
                                        className="text-neutral-500 hover:text-white transition-colors"
                                        title={allVisible ? "Hide all player laps" : "Show all player laps"}
                                    >
                                        {allVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2">
                                {playerLaps.map(lap => {
                                    const isSelected = selectedLaps.includes(lap.id);
                                    const isBest = lap.finalTime === bestOverallLapTime && !lap.invalid;
                                    const isSaved = savedLapIds?.has(lap.id);
                                    const isVisible = visibleLapIds ? visibleLapIds.has(lap.id) : true;

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
                                            <div className="flex items-center gap-3">
                                                {/* Visibility toggle */}
                                                {onToggleVisibility && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onToggleVisibility(lap.id); }}
                                                        className="text-neutral-600 hover:text-white transition-colors"
                                                        title={isVisible ? "Hide from map" : "Show on map"}
                                                    >
                                                        {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}

                                                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-400 text-xs">
                                                    {lap.lapNumber}
                                                </div>

                                                {lap.invalid && (
                                                    <div title="Invalid Lap (Paused/Off Track/Pit)">
                                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                                    </div>
                                                )}

                                                {isBest && (
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                        Fastest
                                                    </div>
                                                )}

                                                {isSaved && (
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                                        💾 Saved
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-col items-end gap-2 text-right">
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

                                                {!lap.invalid && (
                                                    <div className="flex items-center gap-2 relative z-10 mt-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onView(lap);
                                                            }}
                                                            className="px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                                                        >
                                                            <Map className="w-3.5 h-3.5 text-indigo-400" />
                                                            View
                                                        </button>

                                                        {/* Dropdown menu */}
                                                        <div className="relative" ref={openMenu === lap.id ? menuRef : null}>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenMenu(openMenu === lap.id ? null : lap.id);
                                                                }}
                                                                className="p-1.5 bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 rounded-lg transition-colors"
                                                            >
                                                                <MoreVertical className="w-3.5 h-3.5 text-neutral-400" />
                                                            </button>

                                                            {openMenu === lap.id && (
                                                                <div className="absolute right-0 top-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl z-50 min-w-[160px] py-1">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleExport(lap); }}
                                                                        className="w-full px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800 flex items-center gap-2"
                                                                    >
                                                                        <Download className="w-3.5 h-3.5" /> Export JSON
                                                                    </button>
                                                                    {onSave && !isSaved && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); onSave(lap); setOpenMenu(null); }}
                                                                            className="w-full px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800 flex items-center gap-2"
                                                                        >
                                                                            <Save className="w-3.5 h-3.5 text-amber-400" /> Save Lap
                                                                        </button>
                                                                    )}
                                                                    {onDelete && isSaved && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); onDelete(lap.id); setOpenMenu(null); }}
                                                                            className="w-full px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-900/20 flex items-center gap-2"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" /> Delete Save
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
