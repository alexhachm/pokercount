import { useEffect, useMemo, useState } from 'react'
import type { Action, DealerView, PlayerHandView } from '@/types'
import { evaluate } from '@/engine/hand'
import { useGame } from '@/store/gameStore'
import { useSettings } from '@/store/settingsStore'
import { useUi } from '@/store/uiStore'
import HandView from '@/components/HandView'
import DealerArea from '@/components/DealerArea'
import ActionBar from '@/components/ActionBar'

/** Signed integer TC label: "+3", "0", "-2". */
const fmtTc = (n: number) => (n > 0 ? `+${n}` : String(n))

/**
 * TC drill screen: the same index-play spots as the deviation drill, but the
 * true count is hidden. The user types the boundary TC (sign toggle + digits)
 * and taps the deviation action to submit — or taps "No deviation" for spots
 * they believe carry no Hi-Lo index (the decoys). The gameStore grades the
 * answer; like DrillScreen, correctness is detected by comparing the mistakes
 * count across the answerTcDrill() call.
 */
export default function TcDrillScreen() {
  const sc = useGame((s) => s.tcDrill)
  const answerTcDrill = useGame((s) => s.answerTcDrill)
  const nextTcDrill = useGame((s) => s.nextTcDrill)
  const endSession = useGame((s) => s.endSession)
  const decisionsCount = useGame((s) => s.decisionsCount)
  const mistakesCount = useGame((s) => s.mistakes.length)

  const surrenderEnabled = useSettings((s) => s.surrenderEnabled)
  const go = useUi((s) => s.go)

  // Snapshot of the mistakes count at the moment of answering, so we can tell
  // whether the store recorded a mistake for THIS answer.
  const [acted, setActed] = useState<{ mistakes: number; drillId: string } | null>(null)

  // Typed boundary TC: digits + a separate sign toggle, because the iOS
  // numeric keypad has no minus key.
  const [tcDigits, setTcDigits] = useState('')
  const [tcSign, setTcSign] = useState<1 | -1>(1)

  // Debounce the swapped-in Next button (same hazard as DrillScreen: a fast
  // double-tap on an action would land its second tap on Next).
  const [nextReady, setNextReady] = useState(false)
  useEffect(() => {
    setNextReady(false)
    if (acted === null) return
    const t = setTimeout(() => setNextReady(true), 300)
    return () => clearTimeout(t)
  }, [acted])

  // Reset per-spot UI when the scenario changes identity.
  const drillId = sc?.id ?? null
  const [seenDrillId, setSeenDrillId] = useState<string | null>(drillId)
  if (drillId !== seenDrillId) {
    setSeenDrillId(drillId)
    setActed(null)
    setTcDigits('')
    setTcSign(1)
  }

  const playerView = useMemo<PlayerHandView | null>(() => {
    if (!sc) return null
    return {
      id: sc.id,
      boxId: sc.id,
      cards: sc.playerCards,
      value: evaluate(sc.playerCards),
      bet: 1,
      isActive: true,
      isDone: false,
      isDoubled: false,
      isSurrendered: false,
      fromSplit: false,
      outcome: 'pending',
      net: 0,
    }
  }, [sc])

  const dealerView = useMemo<DealerView | null>(() => {
    if (!sc) return null
    const up = sc.dealerUpcard
    return {
      cards: [up],
      value: evaluate([up]),
      upcard: up,
      holeRevealed: false,
    }
  }, [sc])

  // Candidate deviation actions for the spot. Deviations can point anywhere
  // (stands, doubles, splits, surrenders), so offer the full set the spot
  // shape allows rather than deriving legality from a live round.
  const legal = useMemo<Action[]>(() => {
    if (!playerView) return []
    const out: Action[] = ['hit', 'stand', 'double']
    if (playerView.value.isPair) out.push('split')
    if (surrenderEnabled) out.push('surrender')
    return out
  }, [playerView, surrenderEnabled])

  if (!sc || !playerView || !dealerView) {
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

  const hasActed = acted !== null && acted.drillId === sc.id
  const wasCorrect = hasActed && acted.mistakes === mistakesCount
  const hasTc = tcDigits.length > 0

  const isReal = sc.deviationIndex != null && sc.deviationAction != null
  const cmp = sc.comparator === 'lte' ? '≤' : '≥'
  const correctLabel = isReal
    ? `${sc.deviationAction!.toUpperCase()} at TC ${cmp} ${fmtTc(sc.deviationIndex!)}`
    : `NO DEVIATION — ${sc.basicAction.toUpperCase()}`

  const submit = (deviation: boolean, action?: Action) => {
    if (hasActed) return
    if (deviation && !hasTc) return
    setActed({ mistakes: mistakesCount, drillId: sc.id })
    answerTcDrill(
      deviation
        ? // `|| 0` also normalizes a typed "-0" back to 0.
          { deviation: true, tc: tcSign * Number(tcDigits) || 0, action }
        : { deviation: false },
    )
  }

  // Progress: decisionsCount counts completed spots; the current one is +1.
  const spot = hasActed ? decisionsCount : decisionsCount + 1

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header: progress + End. No count display — the TC is the question. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-emerald-200/70">
          Spot {spot}
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-amber-300/80">
          TC Drill
        </span>
        <button
          className="min-h-[44px] min-w-[44px] rounded-lg bg-neutral-800 px-4 text-xs font-semibold text-white ring-1 ring-white/15"
          onClick={() => {
            endSession()
            go('summary')
          }}
        >
          End
        </button>
      </div>

      {/* Scenario prompt (no TC shown). */}
      <div className="text-center">
        <span className="text-lg font-bold text-white">{sc.label}</span>
        <span className="mt-0.5 block text-xs text-emerald-100/60">
          At what TC do you deviate — and to what?
        </span>
      </div>

      {/* Table: dealer upcard above, player hand below. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <DealerArea dealer={dealerView} />
        <HandView hand={playerView} label="You" staggered />
      </div>

      {/* Result flash + Next, or the answer controls. */}
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
            <span className="mt-0.5 block text-sm font-semibold">{correctLabel}</span>
            <span className="mt-0.5 block text-xs font-medium opacity-80">{sc.reason}</span>
          </div>
          <button
            className="w-full rounded-xl bg-emerald-500 py-3 text-base font-bold text-emerald-950 disabled:opacity-40"
            disabled={!nextReady}
            onClick={nextTcDrill}
          >
            Next
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* TC entry + the "no deviation" claim. */}
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-label="Toggle true count sign"
              onClick={() => setTcSign((s) => (s === 1 ? -1 : 1))}
              className="w-14 rounded-xl bg-neutral-800 text-xl font-bold text-white ring-1 ring-white/15"
            >
              {tcSign === 1 ? '+' : '−'}
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="TC"
              value={tcDigits}
              onChange={(e) => setTcDigits(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className="min-w-0 flex-1 rounded-xl bg-neutral-900 px-4 py-3 text-center text-xl font-bold text-white ring-1 ring-white/15 placeholder:text-white/30 focus:outline-none focus:ring-emerald-400"
            />
            <button
              type="button"
              onClick={() => submit(false)}
              className="flex-1 touch-manipulation select-none rounded-xl bg-neutral-700 px-2 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-white/15"
            >
              No Deviation
            </button>
          </div>
          {/* Deviation action buttons; enabled once a TC is typed. */}
          <ActionBar legal={legal} onAction={(a) => submit(true, a)} disabled={!hasTc} />
          {!hasTc && (
            <span className="text-center text-[11px] text-emerald-100/50">
              Type the boundary TC to unlock the deviation actions
            </span>
          )}
        </div>
      )}
    </div>
  )
}
