import { type Card, type HandValue, RANK_VALUE } from '@/types'

/**
 * Evaluate a blackjack hand. Aces are valued 11 unless that busts the hand,
 * in which case as many aces as needed are demoted to 1. Only one ace can be
 * 11 at a time (two 11s would already be 22), so we sum aces as 1 and add a
 * single +10 if it fits under 21.
 */
export function evaluate(cards: Card[]): HandValue {
  let total = 0
  let aces = 0
  for (const card of cards) {
    const v = RANK_VALUE[card.rank]
    total += v
    if (card.rank === 'A') aces += 1
  }

  // Each ace was counted as 11 above; demote (subtract 10) while busting and
  // aces remain. This leaves at most one ace as 11 -> soft hand.
  let softAces = aces
  while (total > 21 && softAces > 0) {
    total -= 10
    softAces -= 1
  }

  const soft = softAces > 0
  const isBust = total > 21
  const isBlackjack = cards.length === 2 && total === 21
  const isPair = cards.length === 2 && RANK_VALUE[cards[0].rank] === RANK_VALUE[cards[1].rank]
  const pairRank = isPair ? cards[0].rank : null

  return { total, soft, isBlackjack, isBust, isPair, pairRank }
}

export function isBlackjack(cards: Card[]): boolean {
  return evaluate(cards).isBlackjack
}
