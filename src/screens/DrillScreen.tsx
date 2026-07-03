import { useMemo, useState } from 'react'
import type { Action, DealerView, PlayerHandView } from '@/types'
import { RANK_VALUE } from '@/types'
import { evaluate } from '@/engine/hand'
import { useGame } from '@/store/gameStore'
import { useSettings } from '@/store/settingsStore'
import { useUi } from '@/store/uiStore'
import HandView from '@/components/HandView'
import DealerArea from '@/components/DealerArea'
import ActionBar from '@/components/ActionBar'
import CountDisplay from '@/components/CountDisplay'
import HintBanner from '@/components/HintBanner'

/**
 * Drill screen: presents a single index-play spot with a pre-set true count,
 * the player's hand, the dealer upcard, and an action bar. The gameStore owns
 * correctness — this screen only renders drill state and dispatches act()/
 * nextDrill(). After acting the store advances `decisionsCount` and may push a
 * MistakeRecord; we compare those snapshots to flash correct/incorrect.
 */
export default function DrillScreen() {
  const drill = useGame((s) => s.drill)
  const act = useGame((s) => s.act)
  const nextDrill = useGame((s) => s.nextDrill)
  const endSession = useGame((s) => s.endSession)
  const hint = useGame((s) => s.hint)
  const revealHint = useGame((s) => s.revealHint)
  const legalActions = useGame((s) => s.legalActions)
  const decisionsCount = useGame((s) => s.decisionsCount)
  const mistakesCount = useGame((s) => s.mistakes.length)

  const showCorrectMove = useSettings((s) => s.showCorrectMove)
  const surrenderEnabled = useSettings((s) => s.surrenderEnabled)
  const go = useUi((s) => s.go)

  // Snapshots taken at the moment of acting, so we can detect whether the store
  // recorded a mistake for *this* decision (mistakes length grew) vs a correct
  // play (decisionsCount grew but mistakes did not).
  const [acted, setActed] = useState<{
    decisions: number
    mistakes: number
    drillId: string
  } | null>(null)
  const [hintRevealed, setHintRevealed] = useState(false)

  // The drill changes identity on nextDrill(); reset per-spot UI when it does.
  const drillId = drill?.id ?? null
  const [seenDrillId, setSeenDrillId] = useState<string | null>(drillId)
  if (drillId !== seenDrillId) {
    setSeenDrillId(drillId)
    setActed(null)
    setHintRevealed(false)
  }

  const playerView = useMemo<PlayerHandView | null>(() => {
    if (!drill) return null
    return {
      id: drill.id,
      boxId: drill.id,
      cards: drill.playerCards,
      value: evaluate(drill.playerCards),
      bet: 1,
      isActive: true,
      isDone: false,
      isDoubled: false,
      isSurrendered: false,
      fromSplit: false,
      outcome: 'pending',
      net: 0,
    }
  }, [drill])

  const dealerView = useMemo<DealerView | null>(() => {
    if (!drill) return null
    const up = drill.dealerUpcard
    return {
      cards: [up],
      value: evaluate([up]),
      upcard: up,
      holeRevealed: false,
    }
  }, [drill])

  // Legal actions for the spot. Prefer the store's authoritative list when it
  // is populated; otherwise derive a sensible default from the drill itself so
  // the bar still renders robustly.
  const legal = useMemo<Action[]>(() => {
    if (legalActions.length > 0) return legalActions
    if (!playerView) return []
    const out: Action[] = ['hit', 'stand']
    const twoCards = playerView.cards.length === 2
    if (twoCards) out.push('double')
    if (playerView.value.isPair) out.push('split')
    if (twoCards && surrenderEnabled) out.push('surrender')
    return out
  }, [legalActions, playerView, surrenderEnabled])

  if (!drill || !playerView || !dealerView) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-emerald-100/70">
        <span className="text-sm uppercase tracking-widest">Loading drill…</span>
        <button
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15"
          onClick={() => {
            endSession()
            go('summary')
          }}
        >
          End
        </button>
      </div>
    )
  }

  const hasActed = acted !== null && acted.drillId === drill.id
  const wasCorrect = hasActed && acted.mistakes === mistakesCount

  const handleAction = (a: Action) => {
    if (hasActed) return
    // Capture pre-action counters; the store mutates them synchronously in act().
    setActed({ decisions: decisionsCount, mistakes: mistakesCount, drillId: drill.id })
    act(a)
  }

  const handleShowHint = () => {
    revealHint()
    setHintRevealed(true)
  }

  // Progress: decisionsCount counts completed spots; the current one is +1.
  const spot = hasActed ? decisionsCount : decisionsCount + 1

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header: progress + count (TC always shown in drill mode) + End. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-emerald-200/70">
          Spot {spot}
        </span>
        <CountDisplay
          running={drill.runningCount}
          trueCount={drill.trueCount}
          showRunning={false}
          showTrue
        />
        <button
          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15"
          onClick={() => {
            endSession()
            go('summary')
          }}
        >
          End
        </button>
      </div>

      {/* Scenario prompt. */}
      <div className="text-center">
        <span className="text-lg font-bold text-white">{drill.label}</span>
      </div>

      {/* Table: dealer upcard above, player hand below. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <DealerArea dealer={dealerView} />
        <HandView hand={playerView} label="You" />
      </div>

      {/* Hint (only offered when the setting is on and before acting). */}
      <HintBanner
        hint={hint}
        canShow={showCorrectMove && !hasActed}
        revealed={hintRevealed}
        onShow={handleShowHint}
      />

      {/* Result flash + Next, or the action bar. */}
      {hasActed ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className={`w-full rounded-xl px-4 py-3 text-center text-base font-bold ${
              wasCorrect
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400'
                : 'bg-red-600/20 text-red-200 ring-1 ring-red-500'
            }`}
          >
            {wasCorrect ? 'Correct' : 'Incorrect'}
            <span className="mt-0.5 block text-xs font-medium opacity-80">
              {drill.correct.action.toUpperCase()} — {drill.correct.reason}
            </span>
          </div>
          <button
            className="w-full rounded-xl bg-emerald-500 py-3 text-base font-bold text-emerald-950"
            onClick={nextDrill}
          >
            Next
          </button>
        </div>
      ) : (
        <ActionBar legal={legal} onAction={handleAction} />
      )}
    </div>
  )
}
