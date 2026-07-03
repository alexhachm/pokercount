import type { DealerView, HandValue } from '@/types'
import PlayingCard from '@/components/PlayingCard'

export interface DealerAreaProps {
  dealer: DealerView
  /**
   * Render a face-down placeholder while the dealer has no cards. Turn off
   * during the ticked opening deal so no phantom card sits there before the
   * upcard arrives.
   */
  placeholder?: boolean
}

function totalText(value: HandValue): string {
  if (value.isBlackjack) return 'BJ'
  if (value.isBust) return String(value.total)
  if (value.soft) return `soft ${value.total}`
  return String(value.total)
}

/**
 * Dealer's area: a label, the dealer's cards (the second card rendered
 * face-down until holeRevealed), and the dealer total once the hole is shown.
 */
export default function DealerArea({ dealer, placeholder = true }: DealerAreaProps) {
  const { cards, value, holeRevealed } = dealer

  const badgeTone = value.isBust
    ? 'bg-red-700 text-white'
    : value.isBlackjack
      ? 'bg-amber-400 text-amber-950'
      : 'bg-neutral-900/80 text-white ring-1 ring-white/20'

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-emerald-200/70">Dealer</span>

      <div className="flex -space-x-3">
        {cards.map((c, i) => (
          <PlayingCard
            key={c.id}
            card={c}
            faceDown={!holeRevealed && i === 1}
            size="md"
            // Cards mount one at a time now (per-tick dealing): no stagger.
            dealDelay={0}
          />
        ))}
        {cards.length === 0 && placeholder && <PlayingCard faceDown size="md" />}
      </div>

      {holeRevealed && cards.length > 0 && (
        <span className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums leading-none ${badgeTone}`}>
          {totalText(value)}
        </span>
      )}
    </div>
  )
}
