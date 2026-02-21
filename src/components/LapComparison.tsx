import { LapData } from "@/hooks/useLapManager";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";

export function LapComparison({
    lap1,
    lap2,
    onClose
}: {
    lap1: LapData,
    lap2: LapData,
    onClose: () => void
}) {

    // Decide which is the faster lap to base deltas off of.
    // We compare l2 against l1. If l1 is faster, we show how much time l2 lost.
    const isL1Faster = lap1.finalTime <= lap2.finalTime;
    const baseLap = isL1Faster ? lap1 : lap2;
    const compLap = isL1Faster ? lap2 : lap1;

    const getDelta = (time1: number, time2: number) => {
        const diff = time2 - time1; // comp time - base time
        const sign = diff > 0 ? "+" : "";
        return `${sign}${diff.toFixed(3)}`;
    };

    const getCheckpointRows = () => {
        // We assume checkpoints are roughly matched by distance.
        // Laps might have slightly different number of checkpoints depending on physics ticks.
        const maxLen = Math.max(baseLap.checkpoints.length, compLap.checkpoints.length);
        const rows = [];

        for (let i = 0; i < maxLen; i++) {
            const cpBase = baseLap.checkpoints[i];
            const cpComp = compLap.checkpoints[i];

            if (cpBase && cpComp) {
                rows.push({
                    index: i + 1,
                    distText: (cpBase.distance / 1000).toFixed(1) + " km",
                    baseSpeed: cpBase.speed.toFixed(0),
                    compSpeed: cpComp.speed.toFixed(0),
                    deltaText: getDelta(cpBase.time, cpComp.time),
                    isWorse: cpComp.time > cpBase.time
                });
            }
        }
        return rows;
    };

    return (
        <div className="absolute inset-0 bg-neutral-950/95 backdrop-blur-xl z-50 flex flex-col p-6 animate-[fadeIn_0.3s_ease-out_forwards]">

            <div className="flex items-center justify-between mb-8 border-b border-neutral-800 pb-4">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-bold tracking-widest text-sm uppercase">Back to Dashboard</span>
                </button>
                <h2 className="text-xl font-bold tracking-tighter">
                    Comparison View
                </h2>
            </div>

            <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden">

                {/* Left Col: Lap Summaries */}
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Faster Lap (Base) */}
                        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6">
                            <div className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">Base Lap</div>
                            <div className="text-2xl font-bold">{baseLap.playerName} - Lap {baseLap.lapNumber}</div>
                            <div className="text-4xl font-mono font-light tracking-tighter mt-4 text-white">
                                {baseLap.finalTime.toFixed(3)}s
                            </div>
                        </div>

                        {/* Compared Lap */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 relative">
                            <div className="text-neutral-500 text-xs font-bold uppercase tracking-widest mb-2">Compared Lap</div>
                            <div className="text-2xl font-bold">{compLap.playerName} - Lap {compLap.lapNumber}</div>
                            <div className="text-4xl font-mono font-light tracking-tighter mt-4 text-neutral-300 flex items-end gap-3">
                                {compLap.finalTime.toFixed(3)}s
                                <span className="text-lg font-bold text-red-500 pb-1">+{(compLap.finalTime - baseLap.finalTime).toFixed(3)}s</span>
                            </div>
                        </div>
                    </div>

                    {/* Checkpoint Table */}
                    <div className="flex-1 bg-neutral-900/50 border border-neutral-800 rounded-xl flex flex-col overflow-hidden">
                        <div className="grid grid-cols-4 px-4 py-3 bg-neutral-900 text-xs font-bold tracking-widest text-neutral-500 uppercase border-b border-neutral-800">
                            <div>Point</div>
                            <div className="text-right">Distance</div>
                            <div className="text-right">Base Speed</div>
                            <div className="text-right">Delta to Base</div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {getCheckpointRows().map(row => (
                                <div key={row.index} className="grid grid-cols-4 px-4 py-3 border-b border-neutral-800/50 items-center hover:bg-neutral-800/30 transition-colors">
                                    <div className="text-neutral-400 font-bold">{row.index}</div>
                                    <div className="text-right text-neutral-500 text-sm font-mono">{row.distText}</div>
                                    <div className="text-right font-mono text-emerald-400/80">{row.baseSpeed} mph</div>
                                    <div className={`text-right font-mono font-bold ${row.isWorse ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {row.deltaText}s
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Col: Minimal Map Visual or Additional Stats */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute top-6 left-6 text-xs font-bold text-neutral-500 uppercase tracking-widest">
                        Delta Analysis
                    </div>

                    <div className="text-center text-neutral-600 max-w-sm">
                        <ArrowRightLeft className="w-16 h-16 mx-auto mb-6 opacity-20" />
                        <p className="tracking-wide">
                            The checklist automatically splits the track into roughly 500m segments.
                            Using the deltas on the left, you can identify exactly which braking zone or corner sequence resulted in time loss.
                        </p>
                    </div>
                </div>
            </div>

        </div>
    );
}
