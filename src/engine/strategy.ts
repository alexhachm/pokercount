import type {
  Action,
  Card,
  HandKind,
  IndexPlay,
  StrategyContext,
  StrategyDecision,
  UpcardValue,
} from '@/types'
import { RANK_VALUE } from '@/types'
import { evaluate } from '@/engine/hand'
import { basicStrategyAction } from '@/engine/basicStrategy'
import { findIndexPlay, shouldDeviate } from '@/engine/deviations'

/** Map a dealer upcard to its numeric UpcardValue (A => 11, faces/ten => 10). */
function upcardValue(card: Card): UpcardValue {
  return RANK_VALUE[card.rank] as UpcardValue
}

/**
 * A deviation can only be applied when its action is actually legal given the
 * current options. Hit/stand are always legal; the rest gate on the relevant
 * capability flag from the context.
 */
function deviationLegal(action: Action, ctx: StrategyContext): boolean {
  switch (action) {
    case 'surrender':
      return ctx.canSurrender
    case 'double':
      return ctx.canDouble
    case 'split':
      return ctx.canSplit
    case 'hit':
    case 'stand':
      return true
  }
}

/**
 * Resolve the correct play for a spot: start from basic strategy, then apply a
 * Hi-Lo index play when one exists for this exact (kind, total/pairRank, upcard)
 * spot, the true count triggers it, and the deviation's action is legal.
 */
export function getCorrectPlay(ctx: StrategyContext): StrategyDecision {
  const { playerCards, dealerUpcard, trueCount, ruleset, dasEnabled } = ctx

  const basic = basicStrategyAction(playerCards, dealerUpcard, {
    canDouble: ctx.canDouble,
    canSplit: ctx.canSplit,
    canSurrender: ctx.canSurrender,
    das: dasEnabled,
    ruleset,
  })

  const hv = evaluate(playerCards)
  const up = upcardValue(dealerUpcard)

  // Classify the hand into the index-play kind and gather lookup params.
  let kind: HandKind
  const params: { total?: number; pairRank?: import('@/types').Rank; upcard?: UpcardValue } = {
    upcard: up,
  }
  if (hv.isPair && hv.pairRank) {
    kind = 'pair'
    params.pairRank = hv.pairRank
  } else if (hv.soft) {
    kind = 'soft'
    params.total = hv.total
  } else {
    kind = 'hard'
    params.total = hv.total
  }

  const deviationRules = {
    ruleset,
    surrenderEnabled: ctx.canSurrender,
    dasEnabled,
  }
  const play: IndexPlay | undefined = findIndexPlay(kind, params, deviationRules)

  let action: Action = basic.action
  let basicAction: Action = basic.action
  let reason = basic.reason
  let indexId: string | undefined
  let deviationFired = false

  // A deviation only counts when its boundary index is within the range the
  // user has chosen to memorize (when that limit is enabled). Plays outside the
  // window are treated as if they don't exist — pure basic strategy.
  const inRange =
    !ctx.deviationRange ||
    (play != null &&
      play.index >= ctx.deviationRange.min &&
      play.index <= ctx.deviationRange.max)

  if (play && inRange) {
    // The matched index play is relevant to this spot regardless of whether it
    // fires, so surface its id and let its description drive the reason.
    indexId = play.id
    basicAction = deviationLegal(play.basicAction, ctx) ? play.basicAction : basic.action
    const triggered = shouldDeviate(play, trueCount) && deviationLegal(play.action, ctx)
    if (triggered) {
      action = play.action
      reason = play.description
      deviationFired = action !== basicAction
    } else {
      action = basicAction
      reason = `${basic.reason} (no deviation: ${play.description})`
    }
  }

  return {
    action,
    basicAction,
    isDeviation: deviationFired,
    reason,
    indexId,
  }
}
