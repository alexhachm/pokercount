import type { Card, Rank, StrategyContext } from '@/types'
import { evaluate, isBlackjack } from '@/engine/hand'
import { hiLoTag, runningCountOf, trueCount } from '@/engine/count'
import { dealerShouldHit, playDealerOut } from '@/engine/dealer'
import { basicStrategyAction } from '@/engine/basicStrategy'
import { getCorrectPlay } from '@/engine/strategy'
import { Shoe } from '@/engine/shoe'
import { buildDrillQueue } from '@/engine/drillEngine'

let pass = 0
let fail = 0
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    pass++
  } else {
    fail++
    console.log(`FAIL: ${name}\n   got  ${g}\n   want ${w}`)
  }
}

let idc = 0
const c = (rank: Rank, suit: Card['suit'] = 'S'): Card => ({ rank, suit, id: `t${idc++}` })

// --- hand evaluation ---
eq('A+K blackjack total', evaluate([c('A'), c('K')]).total, 21)
eq('A+K isBlackjack', isBlackjack([c('A'), c('K')]), true)
eq('A+K soft', evaluate([c('A'), c('K')]).soft, true)
eq('A+6 soft17', evaluate([c('A'), c('6')]).total, 17)
eq('A+6 is soft', evaluate([c('A'), c('6')]).soft, true)
eq('A+6+10 hard17', evaluate([c('A'), c('6'), c('10')]).total, 17)
eq('A+6+10 not soft', evaluate([c('A'), c('6'), c('10')]).soft, false)
eq('A+A+9 soft21', evaluate([c('A'), c('A'), c('9')]).total, 21)
eq('8+8 pair', evaluate([c('8'), c('8')]).isPair, true)
eq('10+Q pair tens', evaluate([c('10'), c('Q')]).isPair, true)
eq('10+Q pairRank', evaluate([c('10'), c('Q')]).pairRank, '10')
eq('12+10 bust', evaluate([c('K'), c('5'), c('Q')]).isBust, true)
eq('three-card 21 not blackjack', isBlackjack([c('7'), c('7'), c('7')]), false)

// --- counting ---
eq('hiLo 5', hiLoTag(c('5')), 1)
eq('hiLo 9', hiLoTag(c('9')), 0)
eq('hiLo K', hiLoTag(c('K')), -1)
eq('hiLo A', hiLoTag(c('A')), -1)
eq('running 5,6,K', runningCountOf([c('5'), c('6'), c('K')]), 1)
eq('trueCount 6/2', trueCount(6, 2), 3)

// --- dealer (S17) ---
eq('dealer hits 16', dealerShouldHit(evaluate([c('10'), c('6')]), 'S17'), true)
eq('dealer stands hard 17', dealerShouldHit(evaluate([c('10'), c('7')]), 'S17'), false)
eq('dealer stands soft 17 (S17)', dealerShouldHit(evaluate([c('A'), c('6')]), 'S17'), false)
{
  // deterministic dealer draw: feed fixed cards
  const queue = [c('5'), c('4')] // 16 -> draw 5 = 21 stand
  const hand = playDealerOut([c('10'), c('6')], () => queue.shift()!, 'S17')
  eq('dealer plays 10,6 + 5 -> 21', evaluate(hand).total, 21)
}

// --- basic strategy (S17, DAS, surrender OFF: the common default) ---
const bs = (cards: Card[], up: Card) =>
  basicStrategyAction(cards, up, { canDouble: true, canSplit: true, canSurrender: false, das: true, ruleset: 'S17' }).action
// with surrender ON, 16 v 9/10/A is correctly SURRENDER (late surrender basic)
eq('16 v10 surrenderON = surrender', basicStrategyAction([c('10'), c('6')], c('10'), { canDouble: true, canSplit: true, canSurrender: true, das: true, ruleset: 'S17' }).action, 'surrender')
eq('A,7 v2 = stand (fixed)', bs([c('A'), c('7')], c('2')), 'stand')
eq('A,7 v3 = double', bs([c('A'), c('7')], c('3')), 'double')
eq('A,7 v9 = hit', bs([c('A'), c('7')], c('9')), 'hit')
eq('11 vA = double', bs([c('5'), c('6')], c('A')), 'double')
eq('16 v10 = hit (basic)', bs([c('10'), c('6')], c('10')), 'hit')
eq('8,8 v10 = split', bs([c('8'), c('8')], c('10')), 'split')
eq('12 v4 = stand', bs([c('10'), c('2')], c('4')), 'stand')
eq('12 v2 = hit', bs([c('10'), c('2')], c('2')), 'hit')
eq('9 v3 = double', bs([c('4'), c('5')], c('3')), 'double')
eq('hard 16 v9 = hit', bs([c('10'), c('6')], c('9')), 'hit')

// --- deviations via resolver ---
const ctx = (cards: Card[], up: Card, tc: number, over: Partial<StrategyContext> = {}): StrategyContext => ({
  playerCards: cards,
  dealerUpcard: up,
  trueCount: tc,
  canDouble: true,
  canSplit: true,
  canSurrender: true,
  ruleset: 'S17',
  dasEnabled: true,
  ...over,
})
eq('16v10 TC0 -> stand (dev)', getCorrectPlay(ctx([c('10'), c('6')], c('10'), 0)).action, 'stand')
eq('16v10 TC0 isDeviation', getCorrectPlay(ctx([c('10'), c('6')], c('10'), 0)).isDeviation, true)
eq('16v10 TC-1 noSurr -> hit (no dev)', getCorrectPlay(ctx([c('10'), c('6')], c('10'), -1, { canSurrender: false })).action, 'hit')
eq('12v4 TC0 -> stand (dev)', getCorrectPlay(ctx([c('10'), c('2')], c('4'), 0)).action, 'stand')
eq('11vA TC1 -> double (dev)', getCorrectPlay(ctx([c('6'), c('5')], c('A'), 1)).action, 'double')
eq('15v10 TC0 surr (dev)', getCorrectPlay(ctx([c('10'), c('5')], c('10'), 0)).action, 'surrender')
eq('15v10 TC0 noSurr -> hit', getCorrectPlay(ctx([c('10'), c('5')], c('10'), 0, { canSurrender: false })).action, 'hit')
eq('10,10 v5 TC5 -> split (dev)', getCorrectPlay(ctx([c('10'), c('10')], c('5'), 5)).action, 'split')
eq('10,10 v5 TC2 -> stand', getCorrectPlay(ctx([c('10'), c('10')], c('5'), 2)).action, 'stand')
eq('A,7 v2 TC1 -> double (dev)', getCorrectPlay(ctx([c('A'), c('7')], c('2'), 1)).action, 'double')

// --- deviation range limit (only train indices within [min,max]) ---
// hard16v10 has index 0: excluded by [1,6], included by [-3,6].
eq(
  '16v10 TC0 range[1,6] noSurr -> hit (index out of range)',
  getCorrectPlay(ctx([c('10'), c('6')], c('10'), 0, { canSurrender: false, deviationRange: { min: 1, max: 6 } })).action,
  'hit',
)
eq(
  '16v10 TC0 range[1,6] noSurr not a deviation',
  getCorrectPlay(ctx([c('10'), c('6')], c('10'), 0, { canSurrender: false, deviationRange: { min: 1, max: 6 } })).isDeviation,
  false,
)
eq(
  '16v10 TC0 range[-3,6] noSurr -> stand (in range)',
  getCorrectPlay(ctx([c('10'), c('6')], c('10'), 0, { canSurrender: false, deviationRange: { min: -3, max: 6 } })).action,
  'stand',
)

// --- shoe ---
{
  const shoe = new Shoe(6)
  eq('shoe 6 decks remaining', shoe.remaining, 312)
  eq('shoe decksRemaining', shoe.decksRemaining, 6)
  const drawn = shoe.draw()
  eq('after draw remaining', shoe.remaining, 311)
  eq('drawn is a card', typeof drawn.rank, 'string')
  // stackNext forces next draws
  const a = c('A', 'H')
  const b = c('5', 'D')
  shoe.stackNext([a, b])
  eq('stackNext first', shoe.draw().id, a.id)
  eq('stackNext second', shoe.draw().id, b.id)
}

// --- drill queue ---
{
  const q = buildDrillQueue({ decks: 6, surrenderEnabled: true, das: true, ruleset: 'S17' })
  eq('drill queue non-empty', q.length > 0, true)
  // every scenario's stored correct matches a fresh resolve at its TC
  let mismatches = 0
  for (const s of q) {
    const fresh = getCorrectPlay({
      playerCards: s.playerCards,
      dealerUpcard: s.dealerUpcard,
      trueCount: s.trueCount,
      canDouble: s.playerCards.length === 2,
      canSplit: evaluate(s.playerCards).isPair,
      canSurrender: true,
      ruleset: 'S17',
      dasEnabled: true,
    })
    if (fresh.action !== s.correct.action) mismatches++
  }
  eq('drill scenarios self-consistent', mismatches, 0)

  // range limit shrinks the queue and drops out-of-range index plays
  const limited = buildDrillQueue({
    decks: 6,
    surrenderEnabled: true,
    das: true,
    ruleset: 'S17',
    deviationRange: { min: 1, max: 4 },
  })
  eq('drill range shrinks queue', limited.length < q.length, true)
  eq('drill range drops index-0 play', limited.some((s) => s.indexId === 'hard16v10'), false)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
