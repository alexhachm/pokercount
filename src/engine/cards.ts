import type { Card, Rank, Suit } from '@/types'

/** All ranks in canonical order, low to high (faces follow 10). */
export const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
]

/** All suits. */
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']

/**
 * Build an ordered, unshuffled shoe of `decks` standard 52-card decks.
 * Ids are unique & stable across rebuilds: `${deckIndex}-${rank}${suit}`.
 */
export function buildShoe(decks: number): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit, id: `${d}-${rank}${suit}` })
      }
    }
  }
  return cards
}

/**
 * Pure Fisher-Yates shuffle. Returns a NEW array; does not mutate the input.
 * `rng` must yield values in [0, 1); defaults to Math.random.
 */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}
