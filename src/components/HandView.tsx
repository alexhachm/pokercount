import type { PlayerHandView, HandValue, HandOutcome } from '@/types'
import PlayingCard from '@/components/PlayingCard'

export interface HandViewProps {
  hand: PlayerHandView
  label?: string
  compact?: boolean
}

/** Format the total badge text: "BJ" for blackjack, "soft N" for soft hands. */
function totalText(value: HandValue): string {
  if (value.isBlackjack) return 'BJ'
  if (value.isBust) return String(value.total)
  if (value.soft) return `soft ${value.total}`
  return String(value.total)
}

const OUTCOME_CHIP: Partial<Record<HandOutcome, { label: string; cls: string }>> = {
  win: { label: 'WIN', cls: 'bg-emerald-500 text-emerald-950' },
  lose: { label: 'LOSE', cls: 'bg-red-600 text-white' },
  push: { label: 'PUSH', cls: 'bg-neutral-400 text-neutral-900' },
  blackjack: { label: 'BLACKJACK', cls: 'bg-amber-400 text-amber-950' },
  surrender: { label: 'SURR', cls: 'bg-neutral-500 text-white' },
  bust: { label: 'BUST', cls: 'bg-red-700 text-white' },
}

function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide leading-none ${cls}`}>
      {children}
    </span>
  )
}

/**
 * A player hand: a row of cards, a total badge, and status chips
 * (DOUBLE / SURR / BUST / settled outcome). The whole hand glows when active.
 */
export default function HandView({ hand, label, compact = false }: HandViewProps) {
  const { value, cards, isActive, isDoubled, isSurrendered, outcome, net } = hand
  const size = compact ? 'sm' : 'md'

  const badgeTone = value.isBust
    ? 'bg-red-700 text-white'
    : value.isBlackjack
      ? 'bg-amber-400 text-amber-950'
      : 'bg-neutral-900/80 text-white ring-1 ring-white/20'

  const outcomeChip = outcome !== 'pending' ? OUTCOME_CHIP[outcome] : undefined
  const showNet = outcome !== 'pending' && net !== 0

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl p-2 transition ${
        isActive ? 'bg-emerald-400/10 ring-2 ring-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]' : 'ring-1 ring-transparent'
      }`}
    >
      {label && <span className="text-[0.65rem] font-medium uppercase tracking-wider text-emerald-200/70">{label}</span>}

      <div className="flex -space-x-3">
        {cards.map((c, i) => {
          // A split hand remounts with its retained card (index 0) already on
          // the table — don't re-deal that one; only freshly drawn cards animate.
          const animate = !(hand.fromSplit && i === 0)
          return (
            <PlayingCard key={c.id} card={c} size={size} dealDelay={animate ? i * 70 : undefined} />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1">
        <span className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums leading-none ${badgeTone}`}>
          {totalText(value)}
        </span>

        {isDoubled && <Chip cls="bg-amber-500 text-amber-950">Double</Chip>}
        {isSurrendered && <Chip cls="bg-neutral-500 text-white">Surr</Chip>}
        {value.isBust && outcome === 'pending' && <Chip cls="bg-red-700 text-white">Bust</Chip>}

        {outcomeChip && <Chip cls={outcomeChip.cls}>{outcomeChip.label}</Chip>}
        {showNet && (
          <Chip cls={net > 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
            {net > 0 ? `+${net}` : net}
          </Chip>
        )}
      </div>
    </div>
  )
}
