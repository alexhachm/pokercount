// ============================================================================
// Hi-Lo index plays (deviations from basic strategy driven by the true count).
//
// These are the standard published Hi-Lo indices: the "Illustrious 18" and the
// "Fab 4" late-surrender plays, plus a fuller extended set of commonly-cited
// Hi-Lo indices. Indices follow the conventional rounded-integer values used in
// Wong / Schlesinger / blackjackapprenticeship-style charts.
//
// Interpretation (see IndexPlay in '@/types'):
//   - comparator 'gte' => deviate when trueCount >= index (rich-deck plays:
//     extra stands, doubles, splits, insurance).
//   - comparator 'lte' => deviate when trueCount <= index (poor-deck plays:
//     the few lines where the deviation triggers as the count DROPS).
//
// Lower-bound stands such as "13 v 2 stand at TC >= -1" mean: HIT below the
// index, STAND at/above it. They are therefore encoded as 'gte' with a negative
// index (not 'lte').
//
// findIndexPlay() keys uniquely on (kind, total/pairRank, upcard) and returns
// the first match. To keep that key resolvable there is exactly ONE entry per
// (kind, total, upcard): where late surrender and a higher stand index both
// exist for the same spot (e.g. 15 v 10), the Fab-4 surrender entry is the
// canonical published deviation and is the one kept here. This file is the
// S17-default index set, so the S17 variant of any ruleset-sensitive line
// (e.g. 11 v A) is the one present.
// ============================================================================

import type { Card, HandKind, IndexPlay, Rank, UpcardValue } from '@/types'

export const INDEX_PLAYS: IndexPlay[] = [
  // --- Insurance ------------------------------------------------------------
  // Special: the game layer interprets insurance separately; this is just data.
  {
    id: 'insurance',
    kind: 'insurance',
    index: 3,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: 'Take insurance at TC >= +3',
  },

  // --- Illustrious 18: hard stands (basic = hit, stand when rich) -----------
  {
    id: 'hard16v10',
    kind: 'hard',
    total: 16,
    upcard: 10,
    index: 0,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '16 v 10: stand at TC >= 0',
  },
  {
    id: 'hard16v9',
    kind: 'hard',
    total: 16,
    upcard: 9,
    index: 5,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '16 v 9: stand at TC >= +5',
  },
  {
    id: 'hard15v10',
    kind: 'hard',
    total: 15,
    upcard: 10,
    index: 4,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '15 v 10: stand at TC >= +4',
  },

  // --- Illustrious 18: 12s and 13s (lower-bound stands) ---------------------
  // These all stand at/above the index and hit below it -> 'gte'.
  {
    id: 'hard13v2',
    kind: 'hard',
    total: 13,
    upcard: 2,
    index: -1,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '13 v 2: stand at TC >= -1',
  },
  {
    id: 'hard13v3',
    kind: 'hard',
    total: 13,
    upcard: 3,
    index: -2,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '13 v 3: stand at TC >= -2',
  },
  {
    id: 'hard12v2',
    kind: 'hard',
    total: 12,
    upcard: 2,
    index: 3,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '12 v 2: stand at TC >= +3',
  },
  {
    id: 'hard12v3',
    kind: 'hard',
    total: 12,
    upcard: 3,
    index: 2,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '12 v 3: stand at TC >= +2',
  },
  {
    id: 'hard12v4',
    kind: 'hard',
    total: 12,
    upcard: 4,
    index: 0,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '12 v 4: stand at TC >= 0',
  },
  {
    id: 'hard12v5',
    kind: 'hard',
    total: 12,
    upcard: 5,
    index: -2,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '12 v 5: stand at TC >= -2',
  },
  {
    id: 'hard12v6',
    kind: 'hard',
    total: 12,
    upcard: 6,
    index: -1,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '12 v 6: stand at TC >= -1',
  },

  // --- Illustrious 18: doubles ---------------------------------------------
  {
    id: 'hard11vA',
    kind: 'hard',
    total: 11,
    upcard: 11,
    index: 1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '11 v A: double at TC >= +1',
  },
  {
    id: 'hard10vA',
    kind: 'hard',
    total: 10,
    upcard: 11,
    index: 4,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '10 v A: double at TC >= +4',
  },
  {
    id: 'hard10v10',
    kind: 'hard',
    total: 10,
    upcard: 10,
    index: 4,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '10 v 10: double at TC >= +4',
  },
  {
    id: 'hard9v2',
    kind: 'hard',
    total: 9,
    upcard: 2,
    index: 1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '9 v 2: double at TC >= +1',
  },
  {
    id: 'hard9v7',
    kind: 'hard',
    total: 9,
    upcard: 7,
    index: 3,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '9 v 7: double at TC >= +3',
  },

  // --- Illustrious 18: pair splits (tens vs small upcards) ------------------
  {
    id: 'pair10v5',
    kind: 'pair',
    pairRank: '10',
    upcard: 5,
    index: 5,
    comparator: 'gte',
    action: 'split',
    basicAction: 'stand',
    description: '10,10 v 5: split at TC >= +5',
  },
  {
    id: 'pair10v6',
    kind: 'pair',
    pairRank: '10',
    upcard: 6,
    index: 4,
    comparator: 'gte',
    action: 'split',
    basicAction: 'stand',
    description: '10,10 v 6: split at TC >= +4',
  },

  // --- Fab 4 late-surrender plays -------------------------------------------
  // Surrender (basic = hit) when the count is at/above the index. These are the
  // canonical single entry for their (total, upcard) spot; the corresponding
  // higher stand index for the same spot is intentionally not duplicated here
  // because findIndexPlay() keys uniquely on (kind, total, upcard).
  {
    id: 'surr14v10',
    kind: 'hard',
    total: 14,
    upcard: 10,
    index: 3,
    comparator: 'gte',
    action: 'surrender',
    basicAction: 'hit',
    description: '14 v 10: surrender at TC >= +3',
  },
  {
    id: 'surr15v10',
    kind: 'hard',
    total: 15,
    upcard: 10,
    index: 0,
    comparator: 'gte',
    action: 'surrender',
    basicAction: 'hit',
    description: '15 v 10: surrender at TC >= 0',
  },
  {
    id: 'surr15v9',
    kind: 'hard',
    total: 15,
    upcard: 9,
    index: 2,
    comparator: 'gte',
    action: 'surrender',
    basicAction: 'hit',
    description: '15 v 9: surrender at TC >= +2',
  },
  {
    id: 'surr15vA',
    kind: 'hard',
    total: 15,
    upcard: 11,
    index: 1,
    comparator: 'gte',
    action: 'surrender',
    basicAction: 'hit',
    description: '15 v A: surrender at TC >= +1',
  },

  // ==========================================================================
  // Extended Hi-Lo indices (commonly-published "Catch 22" / extended sets).
  // ==========================================================================

  // --- Extended hard stands (16 lines) --------------------------------------
  {
    id: 'hard16v8',
    kind: 'hard',
    total: 16,
    upcard: 8,
    index: 9,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '16 v 8: stand at TC >= +9',
  },
  {
    id: 'hard16vA',
    kind: 'hard',
    total: 16,
    upcard: 11,
    index: 3,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '16 v A: stand at TC >= +3',
  },

  // --- Extended low-total stands (12/13 vs more upcards) --------------------
  {
    id: 'hard13v4',
    kind: 'hard',
    total: 13,
    upcard: 4,
    index: -3,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '13 v 4: stand at TC >= -3',
  },
  {
    id: 'hard12v7',
    kind: 'hard',
    total: 12,
    upcard: 7,
    index: 8,
    comparator: 'gte',
    action: 'stand',
    basicAction: 'hit',
    description: '12 v 7: stand at TC >= +8',
  },

  // --- Extended hard doubles ------------------------------------------------
  {
    id: 'hard8v5',
    kind: 'hard',
    total: 8,
    upcard: 5,
    index: 4,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '8 v 5: double at TC >= +4',
  },
  {
    id: 'hard8v6',
    kind: 'hard',
    total: 8,
    upcard: 6,
    index: 2,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '8 v 6: double at TC >= +2',
  },
  {
    id: 'hard9v3',
    kind: 'hard',
    total: 9,
    upcard: 3,
    index: -1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '9 v 3: double at TC >= -1',
  },
  {
    id: 'hard9vA',
    kind: 'hard',
    total: 9,
    upcard: 11,
    index: 8,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '9 v A: double at TC >= +8',
  },
  {
    id: 'hard10v9',
    kind: 'hard',
    total: 10,
    upcard: 9,
    index: 4,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: '10 v 9: double at TC >= +4',
  },

  // --- Soft doubles ---------------------------------------------------------
  // A,9 = soft 20, A,8 = soft 19, A,7 = soft 18, A,6 = soft 17, A,2 = soft 13.
  {
    id: 'soft20v6',
    kind: 'soft',
    total: 20,
    upcard: 6,
    index: 1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'stand',
    description: 'A,9 (soft 20) v 6: double at TC >= +1 (H17)',
  },
  {
    id: 'soft20v5',
    kind: 'soft',
    total: 20,
    upcard: 5,
    index: 5,
    comparator: 'gte',
    action: 'double',
    basicAction: 'stand',
    description: 'A,9 (soft 20) v 5: double at TC >= +5',
  },
  {
    id: 'soft19v6',
    kind: 'soft',
    total: 19,
    upcard: 6,
    index: 1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'stand',
    description: 'A,8 (soft 19) v 6: double at TC >= +1',
  },
  {
    id: 'soft19v5',
    kind: 'soft',
    total: 19,
    upcard: 5,
    index: 3,
    comparator: 'gte',
    action: 'double',
    basicAction: 'stand',
    description: 'A,8 (soft 19) v 5: double at TC >= +3',
  },
  {
    id: 'soft19v4',
    kind: 'soft',
    total: 19,
    upcard: 4,
    index: 6,
    comparator: 'gte',
    action: 'double',
    basicAction: 'stand',
    description: 'A,8 (soft 19) v 4: double at TC >= +6',
  },
  {
    id: 'soft18v2',
    kind: 'soft',
    total: 18,
    upcard: 2,
    index: 1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'stand',
    description: 'A,7 (soft 18) v 2: double at TC >= +1',
  },
  {
    id: 'soft17v2',
    kind: 'soft',
    total: 17,
    upcard: 2,
    index: 1,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: 'A,6 (soft 17) v 2: double at TC >= +1',
  },
  {
    id: 'soft13v5',
    kind: 'soft',
    total: 13,
    upcard: 5,
    index: 5,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: 'A,2 (soft 13) v 5: double at TC >= +5',
  },
  {
    id: 'soft13v4',
    kind: 'soft',
    total: 13,
    upcard: 4,
    index: 6,
    comparator: 'gte',
    action: 'double',
    basicAction: 'hit',
    description: 'A,2 (soft 13) v 4: double at TC >= +6',
  },

  // --- Extended pair splits -------------------------------------------------
  {
    id: 'pair10v4',
    kind: 'pair',
    pairRank: '10',
    upcard: 4,
    index: 6,
    comparator: 'gte',
    action: 'split',
    basicAction: 'stand',
    description: '10,10 v 4: split at TC >= +6',
  },
  {
    id: 'pair10v7',
    kind: 'pair',
    pairRank: '10',
    upcard: 7,
    index: 8,
    comparator: 'gte',
    action: 'split',
    basicAction: 'stand',
    description: '10,10 v 7: split at TC >= +8',
  },
] as const

/**
 * Look up an index play by hand kind plus its discriminating parameters.
 * Hard/soft hands match on `total`; pairs match on `pairRank`. Insurance
 * matches on kind alone (no upcard/total). The first matching entry wins.
 *
 * INDEX_PLAYS holds exactly one entry per (kind, total/pairRank, upcard), so
 * the "first match" is unambiguous and every entry is reachable.
 */
export function findIndexPlay(
  kind: HandKind,
  params: { total?: number; pairRank?: Rank; upcard?: UpcardValue },
): IndexPlay | undefined {
  if (kind === 'insurance') {
    return INDEX_PLAYS.find((p) => p.kind === 'insurance')
  }

  return INDEX_PLAYS.find((p) => {
    if (p.kind !== kind) return false
    if (p.upcard !== params.upcard) return false
    if (kind === 'pair') return p.pairRank === params.pairRank
    return p.total === params.total
  })
}

/**
 * Whether the live true count triggers this index play.
 *   'gte' => deviate when trueCount >= index (rich-deck plays).
 *   'lte' => deviate when trueCount <= index (poor-deck plays).
 */
export function shouldDeviate(play: IndexPlay, trueCount: number): boolean {
  return play.comparator === 'gte'
    ? trueCount >= play.index
    : trueCount <= play.index
}

// `Card` is part of the engine contract surface; re-export the type so callers
// importing strictly from deviations keep a single import site if desired.
export type { Card }
