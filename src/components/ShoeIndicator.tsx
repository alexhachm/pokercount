export interface ShoeIndicatorProps {
  decks: number
  decksRemaining: number
}

export default function ShoeIndicator({ decks, decksRemaining }: ShoeIndicatorProps) {
  // Clamp the fraction so a slightly-stale count can't overflow/underflow the bar.
  const fraction = decks > 0 ? Math.max(0, Math.min(1, decksRemaining / decks)) : 0

  return (
    <div className="flex items-center gap-2 text-slate-200">
      <span className="text-xs font-bold tabular-nums">{decks}D</span>
      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-700">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-400">
        ≈{decksRemaining.toFixed(1)} left
      </span>
    </div>
  )
}
