import { HILO_VALUE, type Card, type CountState } from '@/types'

/** Hi-Lo tag for a single card (2-6 = +1, 7-9 = 0, 10-A = -1). */
export function hiLoTag(card: Card): number {
  return HILO_VALUE[card.rank]
}

/** Running Hi-Lo count summed over the given (revealed) cards. */
export function runningCountOf(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + hiLoTag(card), 0)
}

/**
 * True count = running / decks remaining.
 * Clamp the divisor away from zero so a (near-)empty shoe never produces
 * Infinity/NaN; the result stays exact (no rounding) per contract.
 */
export function trueCount(running: number, decksRemaining: number): number {
  return running / Math.max(decksRemaining, 1e-6)
}

/** Derive the full count state from the revealed cards and decks remaining. */
export function computeCount(revealedCards: Card[], decksRemaining: number): CountState {
  const running = runningCountOf(revealedCards)
  return {
    running,
    decksRemaining,
    trueCount: trueCount(running, decksRemaining),
  }
}
