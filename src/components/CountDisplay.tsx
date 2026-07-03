export interface CountDisplayProps {
  running: number
  trueCount: number
  showRunning: boolean
  showTrue: boolean
}

export default function CountDisplay({
  running,
  trueCount,
  showRunning,
  showTrue,
}: CountDisplayProps) {
  if (!showRunning && !showTrue) return null

  return (
    <div className="flex items-center gap-2 tabular-nums">
      {showRunning && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-100 ring-1 ring-slate-600">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">RC</span>
          {running > 0 ? `+${running}` : running}
        </span>
      )}
      {showTrue && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-100 ring-1 ring-slate-600">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">TC</span>
          {trueCount > 0 ? `+${trueCount.toFixed(1)}` : trueCount.toFixed(1)}
        </span>
      )}
    </div>
  )
}
