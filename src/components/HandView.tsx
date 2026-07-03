import type { Action, PlayerHandView, HandValue, HandOutcome } from '@/types'
import PlayingCard from '@/components/PlayingCard'
import { useSettings } from '@/store/settingsStore'

export interface HandViewProps {
  hand: PlayerHandView
  label?: string
  compact?: boolean
  /** Bot action being announced for this hand (renders a floating badge). */
  actionBadge?: Action | null
  /**
   * Stagger the deal-in animation across the cards (70ms apart). For hands
   * that mount whole (drill scenarios); play mode mounts cards one per tick.
   */
  staggered?: boolean
  /**
   * Exact horizontal overlap between adjacent cards, px (computed by the
   * table layout engine). Omitted (drill/summary) → class-based default fan.
   */
  cardOverlapPx?: number
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

/** Announced-bot-action badge styling, matching the ActionBar colors. */
const ACTION_BADGE: Record<Action, { label: string; cls: string }> = {
  hit: { label: 'HIT', cls: 'bg-green-600 text-white' },
  stand: { label: 'STAND', cls: 'bg-red-600 text-white' },
  double: { label: 'DOUBLE', cls: 'bg-amber-500 text-amber-950' },
  split: { label: 'SPLIT', cls: 'bg-blue-600 text-white' },
  surrender: { label: 'SURR', cls: 'bg-gray-500 text-white' },
}

/**
 * A player hand: a row of cards, a total badge, and status chips
 * (DOUBLE / SURR / BUST / settled outcome). The whole hand glows when active.
 */
export default function HandView({
  hand,
  label,
  compact = false,
  actionBadge,
  staggered = false,
  cardOverlapPx,
}: HandViewProps) {
  const { value, cards, isActive, isDoubled, isSurrendered, outcome, net } = hand
  const size = compact ? 'sm' : 'md'
  // Setting: hide the total under the cards to practice reading hands.
  const showHandTotals = useSettings((s) => s.showHandTotals)

  const badgeTone = value.isBust
    ? 'bg-red-700 text-white'
    : value.isBlackjack
      ? 'bg-amber-400 text-amber-950'
      : 'bg-neutral-900/80 text-white ring-1 ring-white/20'

  const outcomeChip = outcome !== 'pending' ? OUTCOME_CHIP[outcome] : undefined
  const showNet = outcome !== 'pending' && net !== 0

  return (
    <div
      className={`relative flex flex-col items-center gap-1 rounded-xl p-2 transition ${
        isActive ? 'bg-emerald-400/10 ring-2 ring-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]' : 'ring-1 ring-transparent'
      }`}
    >
      {actionBadge && (
        <span
          className={`action-pop absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider shadow-lg ${ACTION_BADGE[actionBadge].cls}`}
        >
          {ACTION_BADGE[actionBadge].label}
        </span>
      )}
      {label && <span className="text-[0.65rem] font-medium uppercase tracking-wider text-emerald-200/70">{label}</span>}

      {/* An undealt box shows an empty betting outline, not a phantom "0". */}
      {cards.length === 0 && (
        <div
          className={`${compact ? 'h-16 w-11' : 'h-24 w-16'} rounded-lg border-2 border-dashed border-white/20`}
          aria-label="Empty betting box"
        />
      )}

      {/* Tight fan: heavy card overlap keeps hands narrow, which lets the
          table keep full-size cards. The table layout engine passes the exact
          overlap; screens without it (drill) get the class-based default. */}
      <div
        className={`flex ${
          cardOverlapPx === undefined ? (cards.length > 5 ? '-space-x-8' : '-space-x-5') : ''
        }`}
      >
        {cards.map((c, i) => {
          // In play mode cards land one at a time (the store deals per tick),
          // so each card animates on its own mount; `staggered` restores the
          // 70ms fan for hands that mount whole (drill). A split hand remounts
          // with its retained card (index 0) already on the table — don't
          // re-deal that one; only freshly drawn cards animate.
          const animate = !(hand.fromSplit && i === 0)
          return (
            <div
              key={c.id}
              style={
                cardOverlapPx !== undefined && i > 0
                  ? { marginLeft: -cardOverlapPx }
                  : undefined
              }
            >
              <PlayingCard
                card={c}
                size={size}
                dealDelay={animate ? (staggered ? i * 70 : 0) : undefined}
              />
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {cards.length > 0 && showHandTotals && (
          <span className={`rounded-md px-2 py-0.5 text-sm font-bold tabular-nums leading-none ${badgeTone}`}>
            {totalText(value)}
          </span>
        )}

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
