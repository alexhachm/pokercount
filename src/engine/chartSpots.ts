// ============================================================================
// Chart "spots": the (chart row, dealer upcard) coordinates the Charts screen
// and the lifetime stats store share. A spot identifies one cell of the basic
// strategy chart — e.g. hard 16 vs 10 — independent of the concrete cards that
// produced it, so decisions made in Play and Drill mode can be aggregated per
// chart cell.
//
// Classification here deliberately mirrors getCorrectPlay() / basicStrategy:
// pair first (A,A is a pair, never soft 12), then soft, then hard with the
// same 5..21 clamp the strategy resolver uses — so a recorded decision always
// lands on the exact cell whose code graded it.
// ============================================================================

import type { Card, IndexPlay, Rank, UpcardValue } from '@/types'
import { RANK_VALUE } from '@/types'
import { isPair, rawValue } from '@/engine/basicStrategy'
import { INDEX_PLAYS } from '@/engine/deviations'

export type ChartKind = 'hard' | 'soft' | 'pair'

export interface ChartSpot {
  kind: ChartKind
  /** Hard total 5..21, soft total 13..20, or pair card value 2..11 (A = 11). */
  row: number
  upcard: UpcardValue
}

/**
 * Stable string key for a spot, used as the stats-store record key.
 * Numeric upcard (Ace serializes as 11), e.g. "hard-16-v-10", "pair-11-v-11".
 */
export function spotKey(spot: ChartSpot): string {
  return `${spot.kind}-${spot.row}-v-${spot.upcard}`
}

/**
 * Map a concrete hand + dealer upcard onto its chart spot.
 * Every actionable hand has one: the classification below reproduces
 * basicStrategyAction's routing exactly (pair → soft row if one exists →
 * hard clamp), so a recorded decision always lands on the cell whose code
 * graded it.
 */
export function spotForHand(playerCards: Card[], dealerUpcard: Card): ChartSpot {
  const upcard = RANK_VALUE[dealerUpcard.rank] as UpcardValue

  // Pairs first: exactly two cards of equal blackjack value (K,Q counts as a
  // ten pair, matching hand.ts / basicStrategy semantics). Row is the value.
  if (isPair(playerCards)) {
    return { kind: 'pair', row: RANK_VALUE[playerCards[0].rank], upcard }
  }

  const { total, soft } = rawValue(playerCards)
  // Soft rows exist only for 13..20 — the exact totals SOFT has rows for. Any
  // other soft total falls through to the hard clamp, because that is what
  // basicStrategyAction does: a multi-card soft 21 (e.g. A,4,6 — still
  // actionable, unlike a two-card blackjack) is graded by the HARD[21] row,
  // so its decision must land on the hard-21 cell to keep the cell's attempt
  // count aligned with what the grader actually graded. (Soft 12 can't occur
  // outside the A,A pair, but the fall-through covers it identically too.)
  if (soft && total >= 13 && total <= 20) {
    return { kind: 'soft', row: total, upcard }
  }

  // Hard rows: clamp exactly like basicStrategyAction (two cards can't total
  // under 5; 21+ plays as the 21 row).
  return { kind: 'hard', row: Math.min(Math.max(total, 5), 21), upcard }
}

/** '10' for value 10, 'A' for 11, digits otherwise. */
function rankForValue(v: number): Rank {
  return v === 11 ? 'A' : (String(v) as Rank)
}

function card(rank: Rank, suit: Card['suit'], id: string): Card {
  return { rank, suit, id: `chart-${id}` }
}

/**
 * A representative display hand for a spot (detail overlay). Cards get unique
 * 'chart-' ids so React keys never collide with live shoe cards.
 */
export function sampleCards(spot: ChartSpot): { player: Card[]; dealer: Card } {
  const dealer = card(rankForValue(spot.upcard), 'D', 'dealer')

  if (spot.kind === 'pair') {
    const r = rankForValue(spot.row)
    // Same rank, different suits — visibly a pair without being the same card.
    return { player: [card(r, 'S', 'p1'), card(r, 'H', 'p2')], dealer }
  }

  if (spot.kind === 'soft') {
    // Soft T is always representable as A + (T - 11); kicker 2..9, never a pair.
    return {
      player: [card('A', 'S', 'p1'), card(rankForValue(spot.row - 11), 'H', 'p2')],
      dealer,
    }
  }

  // Hard totals. Prefer two non-equal, non-ace cards; hard 20 and 21 have no
  // such two-card representation (any ten + ten is a value pair), so show the
  // natural three-card hands players actually hold them as.
  const t = spot.row
  if (t === 20) {
    return { player: [card('10', 'S', 'p1'), card('8', 'H', 'p2'), card('2', 'C', 'p3')], dealer }
  }
  if (t === 21) {
    return { player: [card('10', 'S', 'p1'), card('9', 'H', 'p2'), card('2', 'C', 'p3')], dealer }
  }
  // 12..19: ten + (t - 10) is distinct and ace-free. 5..11: 2 + (t - 2) is
  // distinct (t=4 would pair, but hard rows start at 5) and ace-free.
  const [a, b] = t >= 12 ? [10, t - 10] : [2, t - 2]
  return { player: [card(rankForValue(a), 'S', 'p1'), card(rankForValue(b), 'H', 'p2')], dealer }
}

/**
 * The Hi-Lo index play that applies to a chart spot, as an array for the
 * detail overlay (insurance excluded — it is not a chart cell; the Charts
 * screen surfaces it as a footer note instead).
 *
 * FIRST match only, mirroring findIndexPlay(): the grading engine resolves a
 * spot's deviation via first-match, and INDEX_PLAYS is not perfectly unique
 * per key (hard 15 v 10 carries both a stand line and a Fab-4 surrender line;
 * only the first — 'hard15v10' stand — is ever applied). Listing every raw
 * match would show the player a deviation the grader never applies and then
 * mark them wrong for following it, so the overlay must dedupe exactly the
 * way the grader does.
 *
 * Pair deviations key on a string Rank ('10') while pair rows are numeric
 * values, so match through RANK_VALUE.
 */
export function indexPlaysForSpot(spot: ChartSpot): IndexPlay[] {
  const match = INDEX_PLAYS.find((p) => {
    if (p.kind === 'insurance') return false
    if (p.upcard !== spot.upcard) return false
    if (spot.kind === 'pair') {
      return p.kind === 'pair' && p.pairRank !== undefined && RANK_VALUE[p.pairRank] === spot.row
    }
    return p.kind === spot.kind && p.total === spot.row
  })
  return match ? [match] : []
}
