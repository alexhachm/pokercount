import type { Action, StrategyContext } from '@/types'
import { getCorrectPlay } from '@/engine/strategy'

/**
 * Bot players use count-aware optimal play: basic strategy plus any triggered,
 * legal Hi-Lo index deviation. Insurance is handled by the game layer.
 */
export function botDecision(ctx: StrategyContext): Action {
  return getCorrectPlay(ctx).action
}
