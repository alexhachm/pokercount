// ============================================================================
// Hi-Lo index plays (deviations from basic strategy driven by the true count).
//
// The source of truth lives in research/deviations/deviations-index.json. This
// module projects that researched superset into the app's IndexPlay contract for
// the active rules: S17/H17, late surrender, and DAS.
//
// Duplicate research rows are intentional. A surrender line and a non-surrender
// stand line can describe the same chart spot; the flat app contract can only
// hold one row per spot, so surrender is canonical when offered, otherwise the
// non-surrender line is used.
// ============================================================================

import research from '../../research/deviations/deviations-index.json'
import type {
  Action,
  Card,
  HandKind,
  IndexPlay,
  Rank,
  Ruleset,
  UpcardValue,
} from '@/types'

type Comparator = IndexPlay['comparator']
type Confidence = 'high' | 'medium' | 'low'

interface ResearchDeviation {
  id: string
  kind: HandKind
  spot: string
  dealerUpcard: number | null
  playerTotal: number | null
  pairRank: string | null
  action: Action
  basicAction: Action
  comparator: Comparator
  indexS17: number | null
  indexH17: number | null
  requiresDAS: boolean
  requiresSurrender: boolean
  confidence: Confidence
  tags: string[]
  notes: string
}

interface ResearchIndex {
  deviations: ResearchDeviation[]
}

export interface DeviationRules {
  ruleset: Ruleset
  surrenderEnabled: boolean
  dasEnabled: boolean
}

const DATA = research as ResearchIndex

export const DEFAULT_DEVIATION_RULES: DeviationRules = {
  ruleset: 'S17',
  surrenderEnabled: false,
  dasEnabled: true,
}

function indexForRuleset(d: ResearchDeviation, ruleset: Ruleset): number | null {
  return ruleset === 'H17' ? d.indexH17 : d.indexS17
}

function spotKey(d: ResearchDeviation): string {
  if (d.kind === 'insurance') return 'insurance'
  return `${d.kind}:${d.playerTotal ?? d.pairRank}:v${d.dealerUpcard}`
}

function canonicalBySpot(
  rows: ResearchDeviation[],
  opts: DeviationRules,
): ResearchDeviation[] {
  const bySpot = new Map<string, ResearchDeviation>()
  for (const row of rows) {
    const key = spotKey(row)
    const current = bySpot.get(key)
    if (!current) {
      bySpot.set(key, row)
      continue
    }

    if (opts.surrenderEnabled) {
      if (!current.requiresSurrender && row.requiresSurrender) bySpot.set(key, row)
    } else if (current.requiresSurrender && !row.requiresSurrender) {
      bySpot.set(key, row)
    }
  }
  return [...bySpot.values()]
}

function formatIndex(play: Pick<IndexPlay, 'comparator' | 'index'>): string {
  const sign = play.comparator === 'gte' ? '>=' : '<='
  const value = play.index > 0 ? `+${play.index}` : String(play.index)
  return `TC ${sign} ${value}`
}

function fallbackDescription(d: ResearchDeviation, play: IndexPlay): string {
  const action = play.action[0].toUpperCase() + play.action.slice(1)
  return `${d.spot}: ${action.toLowerCase()} at ${formatIndex(play)}`
}

function toIndexPlay(d: ResearchDeviation, ruleset: Ruleset): IndexPlay {
  const index = indexForRuleset(d, ruleset)
  if (index == null) {
    throw new Error(`Cannot project ${d.id}: no ${ruleset} index`)
  }

  const play: IndexPlay = {
    id: d.id,
    kind: d.kind,
    index,
    comparator: d.comparator,
    action: d.action,
    basicAction: d.basicAction,
    description: '',
  }

  if (d.playerTotal != null) play.total = d.playerTotal
  if (d.pairRank != null) play.pairRank = d.pairRank as Rank
  if (d.dealerUpcard != null) play.upcard = d.dealerUpcard as UpcardValue
  play.description = d.notes || fallbackDescription(d, play)
  return play
}

export function getIndexPlays(opts: DeviationRules = DEFAULT_DEVIATION_RULES): IndexPlay[] {
  const eligible = DATA.deviations.filter((d) => {
    if (indexForRuleset(d, opts.ruleset) == null) return false
    if (d.requiresSurrender && !opts.surrenderEnabled) return false
    if (d.requiresDAS && !opts.dasEnabled) return false
    return true
  })
  return canonicalBySpot(eligible, opts).map((d) => toIndexPlay(d, opts.ruleset))
}

// Default S17 / no-surrender / DAS projection kept for simple imports and tests.
export const INDEX_PLAYS: IndexPlay[] = getIndexPlays()

/**
 * Look up an index play by hand kind plus its discriminating parameters.
 * Hard/soft hands match on `total`; pairs match on `pairRank`. Insurance
 * matches on kind alone.
 */
export function findIndexPlay(
  kind: HandKind,
  params: { total?: number; pairRank?: Rank; upcard?: UpcardValue },
  opts: DeviationRules = DEFAULT_DEVIATION_RULES,
): IndexPlay | undefined {
  const plays = getIndexPlays(opts)
  if (kind === 'insurance') return plays.find((p) => p.kind === 'insurance')

  return plays.find((p) => {
    if (p.kind !== kind) return false
    if (p.upcard !== params.upcard) return false
    if (kind === 'pair') return p.pairRank === params.pairRank
    return p.total === params.total
  })
}

/**
 * Whether the live true count triggers this index play.
 *   'gte' => deviate when trueCount >= index.
 *   'lte' => deviate when trueCount <= index.
 */
export function shouldDeviate(play: IndexPlay, trueCount: number): boolean {
  return play.comparator === 'gte'
    ? trueCount >= play.index
    : trueCount <= play.index
}

// `Card` is part of the engine contract surface; re-export the type so callers
// importing strictly from deviations keep a single import site if desired.
export type { Card }
