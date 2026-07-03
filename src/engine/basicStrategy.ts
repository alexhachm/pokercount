import type { Action, Card, Rank, Ruleset, UpcardValue } from '@/types'
import { RANK_VALUE } from '@/types'

// ============================================================================
// Multi-deck (4–8 deck), Dealer Stands on Soft 17 (S17), Double-After-Split
// (DAS) reference basic strategy chart.
//
// Source: the canonical Wizard-of-Odds / standard casino S17 chart. Encoded as
// data tables keyed by [hand total][dealer upcard 2..A]. The resolver below
// then downgrades chart actions that are illegal given the current options
// (e.g. "Double" when the player can no longer double, "Split" past the cap,
// "Surrender" when surrender is not offered).
//
// Cell code legend:
//   H  = Hit            S  = Stand
//   D  = Double if allowed, else Hit        (hard hands)
//   Ds = Double if allowed, else Stand      (soft hands like A,7)
//   P  = Split
//   Ph = Split if DAS, else Hit  (pair plays out as a hard/soft hit otherwise)
//   R  = Surrender if allowed, else Hit
//   Rs = Surrender if allowed, else Stand   (16 v A standard fallback is hit;
//          we only use Rs where the no-surrender play is to stand)
// ============================================================================

// Exported so the Charts screen can render the exact tables the resolver
// plays from — a single source of truth, no duplicated chart data.
export type CellCode = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'Ph' | 'R' | 'Rs' | 'Rp'

// Dealer upcard columns, in order, matching each row's array indices.
export const UPCARDS: UpcardValue[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function upcardIndex(u: UpcardValue): number {
  return UPCARDS.indexOf(u)
}

/** Numeric blackjack value of a dealer upcard (A => 11). */
function upcardValue(card: Card): UpcardValue {
  return RANK_VALUE[card.rank] as UpcardValue
}

// --- Hard totals 5..21 ------------------------------------------------------
// Row keys are the hard total; columns are dealer 2,3,4,5,6,7,8,9,10,A.
const HARD_S17: Record<number, CellCode[]> = {
  5:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9:  ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'],
  12: ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'R', 'H'],
  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'R', 'R', 'R'],
  17: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

// --- Soft totals A,2 (13) .. A,9 (20) ---------------------------------------
// Row keys are the soft total. Ds = double else stand; D = double else hit.
const SOFT_S17: Record<number, CellCode[]> = {
  13: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,2
  14: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,3
  15: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,4
  16: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,5
  17: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,6
  18: ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'], // A,7: stand vs 2, double-else-stand vs 3-6
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // A,8 (S17)
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // A,9
}

// --- Pairs 2,2 .. A,A -------------------------------------------------------
// Row keys are the pair's single-card blackjack value (A=11, ten=10).
// Ph encodes the DAS-dependent splits (only split when DAS is on).
const PAIRS_S17: Record<number, CellCode[]> = {
  2:  ['Ph', 'Ph', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'], // 2,2
  3:  ['Ph', 'Ph', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'], // 3,3
  4:  ['H', 'H', 'H', 'Ph', 'Ph', 'H', 'H', 'H', 'H', 'H'], // 4,4
  5:  ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],    // 5,5 never split -> as hard 10
  6:  ['Ph', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],   // 6,6
  7:  ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],    // 7,7
  8:  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],    // 8,8
  9:  ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],    // 9,9
  10: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],    // 10,10 never split
  11: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],    // A,A
}

const HARD_H17: Record<number, CellCode[]> = {
  ...HARD_S17,
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'],
  17: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'Rs'],
}

const SOFT_H17: Record<number, CellCode[]> = {
  ...SOFT_S17,
  17: ['D', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  18: ['Ds', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],
  19: ['S', 'S', 'S', 'S', 'Ds', 'S', 'S', 'S', 'S', 'S'],
}

const PAIRS_H17: Record<number, CellCode[]> = {
  ...PAIRS_S17,
  8: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'Rp'],
}

export const HARD = HARD_S17
export const SOFT = SOFT_S17
export const PAIRS = PAIRS_S17

export function strategyTablesFor(ruleset: Ruleset): {
  hard: Record<number, CellCode[]>
  soft: Record<number, CellCode[]>
  pair: Record<number, CellCode[]>
} {
  return ruleset === 'H17'
    ? { hard: HARD_H17, soft: SOFT_H17, pair: PAIRS_H17 }
    : { hard: HARD_S17, soft: SOFT_S17, pair: PAIRS_S17 }
}

interface Opts {
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
  das: boolean
  ruleset: Ruleset
}

/** Evaluate raw player total + softness without importing the hand module. */
export function rawValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += RANK_VALUE[c.rank]
    if (c.rank === 'A') aces++
  }
  // Demote aces (11 -> 1) while busting.
  let softAces = aces
  while (total > 21 && softAces > 0) {
    total -= 10
    softAces--
  }
  return { total, soft: softAces > 0 }
}

export function isPair(cards: Card[]): boolean {
  return cards.length === 2 && RANK_VALUE[cards[0].rank] === RANK_VALUE[cards[1].rank]
}

/** Resolve a soft total to its equivalent hard total if it must play as hard. */
function softAsHard(softTotal: number): number {
  // softTotal already counts an ace as 11; the hard equivalent drops it to 1.
  return softTotal - 10
}

/**
 * Resolve a chart cell into a concrete legal action.
 * `hardTotal` / `soft` describe the underlying hand so that illegal double /
 * split codes can fall back to the correct hit-or-stand play.
 */
function resolveCell(
  code: CellCode,
  ctx: { hardTotal: number; soft: boolean },
  opts: Opts,
): Action {
  switch (code) {
    case 'H':
      return 'hit'
    case 'S':
      return 'stand'
    case 'D':
      return opts.canDouble ? 'double' : 'hit'
    case 'Ds':
      return opts.canDouble ? 'double' : 'stand'
    case 'R':
      return opts.canSurrender ? 'surrender' : 'hit'
    case 'Rs':
      return opts.canSurrender ? 'surrender' : 'stand'
    // The SOFT/HARD charts never contain split codes; pair splits are handled
    // exclusively by resolvePairCell. These cases exist only to satisfy the
    // exhaustive CellCode union.
    case 'P':
    case 'Ph':
    case 'Rp':
      return 'hit'
  }
}

function reasonLabel(cards: Card[], soft: boolean, total: number): string {
  if (isPair(cards)) {
    const r = cards[0].rank
    return `${r},${r}`
  }
  if (soft) return `soft ${total}`
  return `hard ${total}`
}

function upcardLabel(u: UpcardValue): string {
  return u === 11 ? 'A' : String(u)
}

export function basicStrategyAction(
  playerCards: Card[],
  dealerUpcard: Card,
  opts: { canDouble: boolean; canSplit: boolean; canSurrender: boolean; das: boolean; ruleset: Ruleset },
): { action: Action; reason: string } {
  const up = upcardValue(dealerUpcard)
  const col = upcardIndex(up)
  const { total, soft } = rawValue(playerCards)

  // --- Pairs first (only when exactly two equal-value cards) ---------------
  if (isPair(playerCards)) {
    const pv = RANK_VALUE[playerCards[0].rank] // pair value: A=11, tens=10
    const row = strategyTablesFor(opts.ruleset).pair[pv]
    if (row) {
      const code = row[col]
      // Underlying hand if not split: for A,A it's soft 12; otherwise hard 2*value.
      const isAcePair = pv === 11
      const mergedTotal = isAcePair ? 12 : pv * 2
      const action = resolvePairCell(code, {
        soft: isAcePair,
        total: mergedTotal,
        up,
        opts,
      })
      return {
        action,
        reason: `${playerCards[0].rank},${playerCards[0].rank} vs ${upcardLabel(up)} -> ${action}`,
      }
    }
  }

  // --- Soft totals (an ace counts as 11) ----------------------------------
  const tables = strategyTablesFor(opts.ruleset)

  if (soft && tables.soft[total]) {
    const code = tables.soft[total][col]
    const action = resolveCell(code, { hardTotal: softAsHard(total), soft: true }, opts)
    return {
      action,
      reason: `${reasonLabel(playerCards, true, total)} vs ${upcardLabel(up)} -> ${action}`,
    }
  }

  // --- Hard totals --------------------------------------------------------
  const clamped = Math.min(Math.max(total, 5), 21)
  const code = tables.hard[clamped][col]
  const action = resolveCell(code, { hardTotal: clamped, soft: false }, opts)
  return {
    action,
    reason: `${reasonLabel(playerCards, false, clamped)} vs ${upcardLabel(up)} -> ${action}`,
  }
}

/**
 * Resolve a pair-chart cell. When the pair is not split (illegal, or Ph with
 * DAS off) the hand is re-evaluated through the soft/hard chart at its merged
 * total so the fallback action is correct (e.g. 4,4 vs 5 with no DAS -> hit;
 * 9,9 vs 7 -> stand because the cell is S, not P).
 */
function resolvePairCell(
  code: CellCode,
  info: { soft: boolean; total: number; up: UpcardValue; opts: Opts },
): Action {
  const { soft, total, up, opts } = info
  const col = upcardIndex(up)

  const playAsTotal = (): Action => {
    const tables = strategyTablesFor(opts.ruleset)
    if (soft && tables.soft[total]) {
      return resolveCell(tables.soft[total][col], { hardTotal: softAsHard(total), soft: true }, opts)
    }
    const clamped = Math.min(Math.max(total, 5), 21)
    return resolveCell(tables.hard[clamped][col], { hardTotal: clamped, soft: false }, opts)
  }

  switch (code) {
    case 'P':
      return opts.canSplit ? 'split' : playAsTotal()
    case 'Ph':
      return opts.das && opts.canSplit ? 'split' : playAsTotal()
    case 'Rp':
      return opts.canSurrender ? 'surrender' : opts.canSplit ? 'split' : playAsTotal()
    // 5,5 and 10,10 rows use non-split codes directly (D / S).
    case 'D':
      return opts.canDouble ? 'double' : 'hit'
    case 'Ds':
      return opts.canDouble ? 'double' : 'stand'
    case 'S':
      return 'stand'
    case 'H':
      return 'hit'
    case 'R':
      return opts.canSurrender ? 'surrender' : 'hit'
    case 'Rs':
      return opts.canSurrender ? 'surrender' : 'stand'
  }
}
