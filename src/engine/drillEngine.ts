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
// then all below-index spots. No ambient randomness is used anywhere.
//
// When `includeFalseSpots` is on, each index play additionally contributes a
// seeded-random 1..5 "decoys": the same hand shape at the same tempting true
// count, but against upcards that have NO Hi-Lo index — so basic strategy stays
// correct at any count. The variable decoy count means the real/false ratio is
// not learnable. The combined queue is then shuffled with the same seeded PRNG
// (`shuffleSeed`) so decoys cannot be identified by position; the engine itself
// stays a pure function of its options.
// ============================================================================

import {
  type Card,
  type DrillScenario,
  type IndexPlay,
  type Rank,
  type Ruleset,
  type StrategyDecision,
  type TcDrillScenario,
  type UpcardValue,
} from '@/types'
import { INDEX_PLAYS, findIndexPlay } from '@/engine/deviations'
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
  /** Mix in decoy spots with no index play and shuffle the queue. */
  includeFalseSpots?: boolean
  /** Seed for the decoy counts + shuffle; same seed => same queue. */
  shuffleSeed?: number
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

// --- False-deviation decoys --------------------------------------------------

const ALL_UPCARDS: UpcardValue[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/**
 * Build a decoy spot from an index play: the same hand shape at the same
 * tempting true count (the play's index), but against an upcard for which NO
 * index play exists — so the correct answer is pure basic strategy. The user
 * must recognize the spot is not indexed rather than pattern-match the count.
 */
function buildFalseScenario(
  play: IndexPlay,
  upValue: UpcardValue,
  opts: DrillOpts,
): DrillScenario {
  const trueCount = play.index
  const runningCount = trueCount * DECKS_REMAINING
  const idTag = `false-${play.kind}-${play.pairRank ?? play.total}v${upValue}-tc${trueCount}`
  const playerCards = playerCardsFor(play, idTag)
  const dealerUpcard = card(upcardRank(upValue), `${idTag}-up`)

  // No index play matches this (kind, total/pairRank, upcard), so this resolves
  // to basic strategy; wrap the reason so the feedback teaches the point.
  const base = getCorrectPlay({
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
  const correct: StrategyDecision = {
    ...base,
    reason: `No index play for this spot — ${base.reason}`,
  }

  const label = `${handLabel(play)} vs ${upcardLabel(upValue)} — TC ${tcTag(trueCount)}`

  return {
    id: `drill-${idTag}`,
    indexId: 'none',
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
 * Find a decoy upcard for an index play: scan upcards from a play-dependent
 * offset (so decoys spread across the upcard range) and take the first one
 * with no index play for this hand shape that has not been used yet. Returns
 * null when every candidate upcard is indexed or already taken.
 */
function decoyFor(
  play: IndexPlay,
  ordinal: number,
  opts: DrillOpts,
  taken: Set<string>,
): DrillScenario | null {
  for (let i = 0; i < ALL_UPCARDS.length; i += 1) {
    const up = ALL_UPCARDS[(ordinal + i) % ALL_UPCARDS.length]
    if (up === play.upcard) continue
    const params =
      play.kind === 'pair'
        ? { pairRank: play.pairRank, upcard: up }
        : { total: play.total, upcard: up }
    if (findIndexPlay(play.kind, params)) continue
    const key = `${play.kind}-${play.pairRank ?? play.total}-${up}-${play.index}`
    if (taken.has(key)) continue
    taken.add(key)
    return buildFalseScenario(play, up, opts)
  }
  return null
}

/** Deterministic PRNG (mulberry32) so the shuffle is a pure function of seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates shuffle driven by the seeded PRNG; does not mutate the input. */
function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Build the full drill queue: for each non-insurance index play, a boundary
 * spot (exact TC === index, deviation applies) and a below-index spot
 * (TC === index - 1, basic strategy applies). Boundary spots come first, then
 * below-index spots — fully deterministic, no Math.random.
 *
 * With `includeFalseSpots` on, each play contributes a seeded-random 1..5
 * decoys (no-index spots at the same true count, distinct upcards) and the
 * whole queue is shuffled with the same PRNG, so real and false spots are
 * indistinguishable by position or by ratio.
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
  const queue = [...boundary, ...below]

  if (!opts.includeFalseSpots) return queue

  const rand = mulberry32(opts.shuffleSeed ?? 1)
  const taken = new Set<string>()
  const decoys: DrillScenario[] = []
  plays.forEach((p, i) => {
    // 1..5 decoys per play; the `taken` set makes each call pick a fresh
    // upcard, and a play whose free upcards run out just yields fewer.
    const n = 1 + Math.floor(rand() * 5)
    for (let k = 0; k < n; k += 1) {
      const d = decoyFor(p, i + k, opts, taken)
      if (d) decoys.push(d)
    }
  })

  return shuffled([...queue, ...decoys], rand)
}

// ============================================================================
// TC drill: the same index-play spots, but the true count is HIDDEN. The user
// must type the boundary TC and pick the deviation action; decoy spots (no
// index play) are always mixed in so "No deviation" stays a live answer, and
// the queue is always shuffled so decoys are indistinguishable by position.
// ============================================================================

/** One TC-drill spot for a real index play (answer: its index + action). */
function buildTcScenario(play: IndexPlay): TcDrillScenario {
  const idTag = `tc-${play.id}`
  const upValue = play.upcard as UpcardValue
  return {
    id: `drill-${idTag}`,
    indexId: play.id,
    playerCards: playerCardsFor(play, idTag),
    dealerUpcard: card(upcardRank(upValue), `${idTag}-up`),
    deviationIndex: play.index,
    comparator: play.comparator,
    deviationAction: play.action,
    basicAction: play.basicAction,
    reason: play.description,
    label: `${handLabel(play)} vs ${upcardLabel(upValue)}`,
  }
}

/**
 * Decoy TC-drill spot: same hand shape as an index play but against an upcard
 * with NO Hi-Lo index, so "No deviation" is the correct answer. Basic strategy
 * is resolved at TC 0; with no index for the spot the count cannot change it.
 */
function buildTcFalseScenario(
  play: IndexPlay,
  upValue: UpcardValue,
  opts: DrillOpts,
): TcDrillScenario {
  const idTag = `tc-false-${play.kind}-${play.pairRank ?? play.total}v${upValue}`
  const playerCards = playerCardsFor(play, idTag)
  const dealerUpcard = card(upcardRank(upValue), `${idTag}-up`)
  const base = getCorrectPlay({
    playerCards,
    dealerUpcard,
    trueCount: 0,
    canDouble: true,
    canSplit: play.kind === 'pair',
    canSurrender: opts.surrenderEnabled,
    ruleset: opts.ruleset,
    dasEnabled: opts.das,
    deviationRange: opts.deviationRange ?? null,
  })
  return {
    id: `drill-${idTag}`,
    indexId: 'none',
    playerCards,
    dealerUpcard,
    deviationIndex: null,
    comparator: null,
    deviationAction: null,
    basicAction: base.action,
    reason: `No index play for this spot — ${base.reason}`,
    label: `${handLabel(play)} vs ${upcardLabel(upValue)}`,
  }
}

/**
 * TC-drill decoy finder: same upcard scan as decoyFor(), but keyed on hand
 * shape + upcard alone — with no count in the prompt, that pair fully
 * identifies a spot, so duplicates would be literally the same question.
 */
function tcDecoyFor(
  play: IndexPlay,
  ordinal: number,
  opts: DrillOpts,
  taken: Set<string>,
): TcDrillScenario | null {
  for (let i = 0; i < ALL_UPCARDS.length; i += 1) {
    const up = ALL_UPCARDS[(ordinal + i) % ALL_UPCARDS.length]
    if (up === play.upcard) continue
    const params =
      play.kind === 'pair'
        ? { pairRank: play.pairRank, upcard: up }
        : { total: play.total, upcard: up }
    if (findIndexPlay(play.kind, params)) continue
    const key = `${play.kind}-${play.pairRank ?? play.total}-${up}`
    if (taken.has(key)) continue
    taken.add(key)
    return buildTcFalseScenario(play, up, opts)
  }
  return null
}

/**
 * Build the TC-drill queue: one spot per non-insurance index play (surrender
 * plays are dropped when surrender is off — their answer would be untypeable),
 * plus a seeded-random 1..5 decoys per play. Decoys are always included and
 * the queue always shuffled: unlike the deviation drill there is no count to
 * anchor on, so "No deviation" must be a plausible answer for every spot.
 */
export function buildTcDrillQueue(opts: DrillOpts): TcDrillScenario[] {
  const range = opts.deviationRange
  const plays = INDEX_PLAYS.filter(
    (p) =>
      p.kind !== 'insurance' &&
      p.upcard != null &&
      (opts.surrenderEnabled || p.action !== 'surrender') &&
      (!range || (p.index >= range.min && p.index <= range.max)),
  )

  const real = plays.map((p) => buildTcScenario(p))

  const rand = mulberry32(opts.shuffleSeed ?? 1)
  const taken = new Set<string>()
  const decoys: TcDrillScenario[] = []
  plays.forEach((p, i) => {
    const n = 1 + Math.floor(rand() * 5)
    for (let k = 0; k < n; k += 1) {
      const d = tcDecoyFor(p, i + k, opts, taken)
      if (d) decoys.push(d)
    }
  })

  return shuffled([...real, ...decoys], rand)
}

// Re-export `evaluate` so drill consumers can validate generated hands from a
// single import site if desired; it is part of the engine contract surface.
export { evaluate }
