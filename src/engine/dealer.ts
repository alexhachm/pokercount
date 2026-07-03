import type { Card, HandValue, Ruleset } from '@/types'
import { evaluate } from '@/engine/hand'

/**
 * S17: dealer stands on ALL 17 (including soft 17) and hits anything below 17.
 * H17 is reserved for a future ruleset; until implemented it mirrors S17 except
 * it hits a soft 17.
 */
export function dealerShouldHit(value: HandValue, ruleset: Ruleset): boolean {
  if (value.total < 17) return true
  if (ruleset === 'H17' && value.total === 17 && value.soft) return true
  return false
}

/**
 * Play the dealer's hand to completion: starting from the hole cards, draw until
 * the dealer must stand (or busts). Returns the full hand including the original
 * hole cards. Stops drawing on bust since total only increases past 21.
 */
export function playDealerOut(
  holeCards: Card[],
  draw: () => Card,
  ruleset: Ruleset,
): Card[] {
  const hand = [...holeCards]
  let value = evaluate(hand)
  while (!value.isBust && dealerShouldHit(value, ruleset)) {
    hand.push(draw())
    value = evaluate(hand)
  }
  return hand
}
