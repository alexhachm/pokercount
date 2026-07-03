// ============================================================================
// Drill scenario generator.
//
// Turns the Hi-Lo index plays (deviations.ts) into a deterministic queue of
// boundary-testing scenarios. For every non-insurance index play we build:
//   1. an "at index" spot   — exact true count == play.index (deviation applies)
//   2. an "index - 1" spot  — one count below (basic strategy applies)
// Both spots fix decksRemaining = 2, so runningCount = trueCount * 2 yields the
// exact integer true count we want (trueCount = running / decksRemaining).
//
// Ordering is deterministic: all boundary spots first (in INDEX_PLAYS order),
// then all below-index spots. No randomness is used anywhere.
// ============================================================================

import {
  type Card,
  type DrillScenario,
  type IndexPlay,
  type Rank,
  type Ruleset,
  type StrategyDecision,
  type UpcardValue,
} from '@/types'
import { INDEX_PLAYS } from '@/engine/deviations'
import { getCorrectPlay } from '@/engine/strategy'
import { evaluate } from '@/engine/hand'

const DECKS_REMAINING = 2

interface DrillOpts {
  decks: number
  surrenderEnabled: boolean
  das: boolean
  ruleset: Ruleset
  /** When set, only drill index plays whose boundary index is in [min, max]. */
  deviationRange?: { min: number; max: number } | null
}

/** Build a stable, unique Card from a rank + a tag that disambiguates the id. */
function card(rank: Rank, tag: string): Card {
  // Suit is cosmetic for strategy/value purposes; pick a deterministic suit per
  // rank for visual variety and keep ids unique via the caller-supplied tag.
  const suit = ({
    A: 'S', '2': 'H', '3': 'D', '4': 'C', '5': 'S', '6': 'H', '7': 'D',
    '8': 'C', '9': 'S', '10': 'H', J: 'D', Q: 'C', K: 'S',
  } as const)[rank]
  return { rank, suit, id: `drill-${tag}-${rank}${suit}` }
}

/** Dealer upcard rank for a given numeric upcard value (11 -> Ace). */
function upcardRank(value: UpcardValue): Rank {
  return value === 11 ? 'A' : (String(value) as Rank)
}

/**
 * Two non-ace, non-pair ranks summing to `total` (8..16). Search rank values
 * 2..10 for distinct a + b === total; distinct values guarantee the hand is not
 * a pair. A solution exists for every indexed hard total in range.
 */
function hardCardsFor(total: number, tag: string): Card[] {
  for (let a = 2; a <= 10; a += 1) {
    const b = total - a
    if (b < 2 || b > 10 || b === a) continue
    return [card(String(a) as Rank, `${tag}-a`), card(String(b) as Rank, `${tag}-b`)]
  }
  // Defensive fallback for totals unreachable by a distinct pair (not used by
  // the current index set): three cards 2 + 2 + (total - 4).
  return [
    card('2', `${tag}-a`),
    card('2', `${tag}-b`),
    card(String(total - 4) as Rank, `${tag}-c`),
  ]
}

/** Soft hand: Ace + the card making the soft total (e.g. soft 18 -> A + 7). */
function softCardsFor(total: number, tag: string): Card[] {
  const kicker = total - 11 // soft total counts the ace as 11
  return [card('A', `${tag}-a`), card(String(kicker) as Rank, `${tag}-b`)]
}

/** Pair hand: two cards of the given pair rank. */
function pairCardsFor(pairRank: Rank, tag: string): Card[] {
  return [card(pairRank, `${tag}-a`), card(pairRank, `${tag}-b`)]
}

/** Player cards appropriate to the index play's kind. */
function playerCardsFor(play: IndexPlay, tag: string): Card[] {
  if (play.kind === 'pair' && play.pairRank) return pairCardsFor(play.pairRank, tag)
  if (play.kind === 'soft' && play.total != null) return softCardsFor(play.total, tag)
  return hardCardsFor(play.total ?? 16, tag)
}

/** Hand description for labels: "Hard 16", "Soft 18", "10,10". */
function handLabel(play: IndexPlay): string {
  if (play.kind === 'pair' && play.pairRank) return `${play.pairRank},${play.pairRank}`
  if (play.kind === 'soft' && play.total != null) return `Soft ${play.total}`
  return `Hard ${play.total ?? '?'}`
}

/** Upcard description: "A" for Ace, otherwise the numeric value. */
function upcardLabel(value: UpcardValue): string {
  return value === 11 ? 'A' : String(value)
}

/** Signed true-count tag for labels: "+1", "0", "-2". */
function tcTag(tc: number): string {
  return tc > 0 ? `+${tc}` : String(tc)
}

/**
 * Build one scenario for an index play at a specific integer true count.
 * `phase` distinguishes the boundary spot from the below-index spot in ids.
 */
function buildScenario(
  play: IndexPlay,
  trueCount: number,
  phase: 'at' | 'below',
  opts: DrillOpts,
): DrillScenario {
  const runningCount = trueCount * DECKS_REMAINING
  const idTag = `${play.id}-${phase}`
  const playerCards = playerCardsFor(play, idTag)
  const upValue = play.upcard as UpcardValue
  const dealerUpcard = card(upcardRank(upValue), `${idTag}-up`)

  const correct: StrategyDecision = getCorrectPlay({
    playerCards,
    dealerUpcard,
    trueCount,
    canDouble: true,
    canSplit: play.kind === 'pair',
    canSurrender: opts.surrenderEnabled,
    ruleset: opts.ruleset,
    dasEnabled: opts.das,
    deviationRange: opts.deviationRange ?? null,
  })

  const label = `${handLabel(play)} vs ${upcardLabel(upValue)} — TC ${tcTag(trueCount)}`

  return {
    id: `drill-${idTag}`,
    indexId: play.id,
    trueCount,
    runningCount,
    decksRemaining: DECKS_REMAINING,
    playerCards,
    dealerUpcard,
    correct,
    label,
  }
}

/**
 * Build the full drill queue: for each non-insurance index play, a boundary
 * spot (exact TC === index, deviation applies) and a below-index spot
 * (TC === index - 1, basic strategy applies). Boundary spots come first, then
 * below-index spots — fully deterministic, no Math.random.
 */
export function buildDrillQueue(opts: DrillOpts): DrillScenario[] {
  const range = opts.deviationRange
  const plays = INDEX_PLAYS.filter(
    (p) =>
      p.kind !== 'insurance' &&
      p.upcard != null &&
      (!range || (p.index >= range.min && p.index <= range.max)),
  )

  const boundary = plays.map((p) => buildScenario(p, p.index, 'at', opts))
  const below = plays.map((p) => buildScenario(p, p.index - 1, 'below', opts))

  return [...boundary, ...below]
}

// Re-export `evaluate` so drill consumers can validate generated hands from a
// single import site if desired; it is part of the engine contract surface.
export { evaluate }
