export interface DiscardTrayProps {
  /** Fraction of the whole shoe already dealt (0..1). */
  dealtFraction: number
  /** Total decks in the shoe, shown as a small caption for scale. */
  decks: number
}

// The tray can hold this many stacked "card edges" at a full shoe. Each dealt
// card thickens the pile; the user eyeballs the height to estimate how many
// decks are gone (and therefore how many remain → the true count divisor).
const MAX_LAYERS = 30
const LAYER_PX = 3

/**
 * A growing discard tray, pinned top-left of the table. Unlike the precise
 * ShoeIndicator ("≈4.2 left"), this is a deliberately analog cue: a pile of
 * cards that grows as the shoe is dealt, so the player practices *estimating*
 * decks remaining the way they would at a real table.
 */
export default function DiscardTray({ dealtFraction, decks }: DiscardTrayProps) {
  const f = Math.max(0, Math.min(1, dealtFraction))
  const layers = Math.round(f * MAX_LAYERS)
  const decksUsed = f * decks

  return (
    <div className="flex flex-col items-center gap-1" aria-label="Discard tray">
      <div
        className="relative flex w-12 flex-col-reverse items-stretch overflow-hidden rounded-md border border-emerald-950/70 bg-emerald-950/40 p-1"
        style={{ height: MAX_LAYERS * LAYER_PX + 8 }}
      >
        {/* Stacked dealt cards grow up from the bottom of the tray. */}
        {Array.from({ length: layers }).map((_, i) => (
          <div
            key={i}
            className="rounded-[2px] border-t border-emerald-900/60 bg-gradient-to-r from-emerald-700 to-emerald-600"
            style={{ height: LAYER_PX }}
          />
        ))}
        {layers === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-[8px] uppercase tracking-wider text-emerald-200/40">
            shoe
          </span>
        )}
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-200/60 tabular-nums">
        ~{decksUsed.toFixed(1)}/{decks} used
      </span>
    </div>
  )
}
