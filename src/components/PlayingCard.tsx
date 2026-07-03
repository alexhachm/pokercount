import type { Card, Suit } from '@/types'

export interface PlayingCardProps {
  card?: Card | null
  faceDown?: boolean
  size?: 'sm' | 'md'
  /** Animate the card dealing in on mount, staggered by this many ms. */
  dealDelay?: number
}

const SUIT_GLYPH: Record<Suit, string> = {
  S: '♠', // ♠
  H: '♥', // ♥
  D: '♦', // ♦
  C: '♣', // ♣
}

const isRed = (suit: Suit) => suit === 'H' || suit === 'D'

const SIZE: Record<NonNullable<PlayingCardProps['size']>, { box: string; rank: string; pip: string; corner: string }> = {
  sm: { box: 'h-16 w-11', rank: 'text-base', pip: 'text-2xl', corner: 'text-[0.65rem]' },
  md: { box: 'h-24 w-16', rank: 'text-xl', pip: 'text-4xl', corner: 'text-sm' },
}

/**
 * Renders a single playing card. With faceDown (or no card) it shows a
 * patterned back; otherwise a white rounded card with rank corners + a centered
 * suit pip, colored red for hearts/diamonds and black for spades/clubs.
 */
export default function PlayingCard({ card, faceDown = false, size = 'md', dealDelay }: PlayingCardProps) {
  const s = SIZE[size]
  const dealCls = dealDelay !== undefined ? 'deal-in' : ''
  const dealStyle =
    dealDelay !== undefined ? { animationDelay: `${dealDelay}ms` } : undefined

  if (faceDown || !card) {
    return (
      <div
        className={`${s.box} shrink-0 rounded-lg border border-emerald-900/60 bg-emerald-800 shadow-md ${dealCls}`}
        style={dealStyle}
        aria-label="Face-down card"
      >
        {/* Diagonal cross-hatch back pattern. */}
        <div className="h-full w-full rounded-lg bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.12)_0,rgba(255,255,255,0.12)_3px,transparent_3px,transparent_8px)] ring-1 ring-inset ring-white/15" />
      </div>
    )
  }

  const glyph = SUIT_GLYPH[card.suit]
  const color = isRed(card.suit) ? 'text-red-600' : 'text-neutral-900'

  return (
    <div
      className={`${s.box} relative shrink-0 select-none rounded-lg bg-white shadow-md ring-1 ring-black/10 ${dealCls}`}
      style={dealStyle}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className={`absolute left-1 top-0.5 font-bold leading-none ${s.corner} ${color}`}>
        <span className="block tabular-nums">{card.rank}</span>
        <span className="block leading-none">{glyph}</span>
      </span>

      <span
        className={`absolute inset-0 flex items-center justify-center font-bold leading-none ${s.pip} ${color}`}
        aria-hidden
      >
        {glyph}
      </span>

      <span className={`absolute bottom-0.5 right-1 rotate-180 font-bold leading-none ${s.corner} ${color}`}>
        <span className="block tabular-nums">{card.rank}</span>
        <span className="block leading-none">{glyph}</span>
      </span>
    </div>
  )
}
