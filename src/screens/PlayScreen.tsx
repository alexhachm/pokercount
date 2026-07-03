import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Action, HandOutcome, SeatView } from '@/types'
import { useGame } from '@/store/gameStore'
import { useSettings } from '@/store/settingsStore'
import { useUi } from '@/store/uiStore'
import ShoeIndicator from '@/components/ShoeIndicator'
import DiscardTray from '@/components/DiscardTray'
import CountDisplay from '@/components/CountDisplay'
import DealerArea from '@/components/DealerArea'
import TableArc from '@/components/TableArc'
import HintBanner from '@/components/HintBanner'
import ActionBar from '@/components/ActionBar'

const OUTCOME_LABEL: Record<HandOutcome, string> = {
  win: 'WIN',
  lose: 'LOSE',
  push: 'PUSH',
  blackjack: 'BLACKJACK',
  surrender: 'SURRENDER',
  bust: 'BUST',
  pending: '',
}

function formatNet(net: number): string {
  const rounded = Math.round(net * 100) / 100
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}`
}

/** A small pill toggle used for the in-play quick controls. */
function ToggleChip({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[44px] select-none rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
        on
          ? 'bg-emerald-500 text-emerald-950'
          : 'bg-slate-800 text-slate-300 ring-1 ring-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * The seat row in table setup. The "You" tile is draggable: pick it up and
 * drop it on any spot to take that seat (pointer events, so it works with
 * touch on the iPhone PWA where HTML5 drag-and-drop does not). Tapping a
 * spot still moves there directly.
 */
function SeatPicker({
  seatCount,
  effectiveSeat,
  onPick,
}: {
  seatCount: number
  effectiveSeat: number
  onPick: (pos: number) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const startPoint = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number; over: number | null; moved: boolean } | null>(
    null,
  )

  /** The seat tile under the pointer, ignoring the tile being dragged. */
  const slotFromPoint = (clientX: number, clientY: number, dragging: boolean): number | null => {
    const row = rowRef.current
    if (!row) return null
    const tiles = Array.from(row.children) as HTMLElement[]
    for (let i = 0; i < tiles.length; i++) {
      if (dragging && i === effectiveSeat) continue // its rect follows the finger
      const r = tiles[i].getBoundingClientRect()
      // A little vertical slack so a wobbly finger doesn't drop the seat.
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top - 24 && clientY <= r.bottom + 24) {
        return i
      }
    }
    return null
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    startPoint.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ dx: 0, dy: 0, over: null, moved: false })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = startPoint.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const { clientX, clientY } = e
    setDrag((d) => {
      if (!d) return d
      const moved = d.moved || Math.hypot(dx, dy) > 6
      return { dx, dy, over: moved ? slotFromPoint(clientX, clientY, true) : null, moved }
    })
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!startPoint.current) return
    const target = drag?.moved ? slotFromPoint(e.clientX, e.clientY, true) : null
    startPoint.current = null
    setDrag(null)
    if (target !== null && target !== effectiveSeat) onPick(target)
  }

  const onPointerCancel = () => {
    startPoint.current = null
    setDrag(null)
  }

  return (
    <div ref={rowRef} className="flex flex-wrap gap-2">
      {Array.from({ length: seatCount }).map((_, pos) => {
        const isYou = pos === effectiveSeat
        const isDropTarget = drag?.moved && drag.over === pos && !isYou
        if (isYou) {
          return (
            <button
              key={pos}
              type="button"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerCancel}
              aria-label="Drag to change your seat"
              className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-emerald-950 ring-2 ring-emerald-300 ${
                drag?.moved ? 'cursor-grabbing shadow-xl' : 'cursor-grab'
              }`}
              style={{
                touchAction: 'none', // the drag owns the gesture; no page scroll
                transform: drag?.moved
                  ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.12)`
                  : undefined,
                transition: drag?.moved ? 'none' : 'transform 150ms ease',
                zIndex: drag?.moved ? 10 : undefined,
                position: 'relative',
              }}
            >
              <span className="text-base">🧑</span>
              You
            </button>
          )
        }
        return (
          <button
            key={pos}
            type="button"
            onClick={() => onPick(pos)}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${
              isDropTarget
                ? 'bg-emerald-900/70 text-emerald-200 ring-2 ring-dashed ring-emerald-300'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            <span className="text-base">🤖</span>
            {isDropTarget ? 'Here' : 'Bot'}
          </button>
        )
      })}
    </div>
  )
}

/** A horizontal +/- stepper for the setup + between-rounds controls. */
function MiniStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="h-11 w-11 rounded-lg bg-slate-700 text-xl font-bold text-white disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-[1.5rem] text-center text-lg font-bold tabular-nums text-white">
        {value}
      </span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="h-11 w-11 rounded-lg bg-slate-700 text-xl font-bold text-white disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}

/**
 * The main Blackjack table. Before the first deal it shows a table-setup panel
 * (seat, hands, other players, visibility). During play the header carries the
 * growing discard tray (for deck estimation) plus quick count/hint toggles, and
 * the round-over panel lets the player spread to more hands before the next deal.
 */
export default function PlayScreen() {
  const decks = useSettings((s) => s.decks)
  const showRunningCount = useSettings((s) => s.showRunningCount)
  const showTrueCount = useSettings((s) => s.showTrueCount)
  const showCorrectMove = useSettings((s) => s.showCorrectMove)
  const numHands = useSettings((s) => s.numHands)
  const numOtherPlayers = useSettings((s) => s.numOtherPlayers)
  const humanSeatPosition = useSettings((s) => s.humanSeatPosition)
  const setSetting = useSettings((s) => s.set)

  const phase = useGame((s) => s.phase)
  const seats = useGame((s) => s.seats)
  const dealer = useGame((s) => s.dealer)
  const humanSeatIndex = useGame((s) => s.humanSeatIndex)
  const running = useGame((s) => s.count.running)
  const decksRemaining = useGame((s) => s.count.decksRemaining)
  const displayTrueCount = useGame((s) => s.displayTrueCount)
  const hint = useGame((s) => s.hint)
  const legalActions = useGame((s) => s.legalActions)
  const botAction = useGame((s) => s.botAction)

  const insuranceTaken = useGame((s) => s.insuranceTaken)
  const insuranceNet = useGame((s) => s.insuranceNet)

  const act = useGame((s) => s.act)
  const takeInsurance = useGame((s) => s.takeInsurance)
  const revealHint = useGame((s) => s.revealHint)
  const startPlayRound = useGame((s) => s.startPlayRound)
  const endSession = useGame((s) => s.endSession)
  const resetSession = useGame((s) => s.resetSession)

  const go = useUi((s) => s.go)

  // The human's effective seat for the picker (sentinel default => last seat).
  const seatCount = numOtherPlayers + 1
  const effectiveSeat = Math.min(Math.max(0, humanSeatPosition), numOtherPlayers)

  const humanSeat: SeatView | undefined = seats[humanSeatIndex]
  const humanHandActive = !!humanSeat && humanSeat.hands.some((h) => h.isActive)
  const isHumanTurn = phase === 'playerTurn' && humanHandActive

  const revealed = !!hint
  const canShowHint = showCorrectMove && isHumanTurn && !revealed
  const showActionBar = phase === 'playerTurn'

  // Fraction of the shoe already dealt drives the discard tray height.
  const dealtFraction = decks > 0 ? 1 - decksRemaining / decks : 0

  const handleEnd = () => {
    endSession()
    go('summary')
  }

  // -------------------------------------------------------------------------
  // Table setup (shown before the first deal of a session).
  // -------------------------------------------------------------------------
  if (phase === 'idle') {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-4">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              resetSession()
              go('home')
            }}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white"
          >
            ‹ Back
          </button>
          <h1 className="m-0 text-xl font-bold">Table setup</h1>
        </header>

        <section className="flex flex-col gap-3 rounded-xl bg-slate-800/60 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Your seat (dealt left to right)
          </span>
          <SeatPicker
            seatCount={seatCount}
            effectiveSeat={effectiveSeat}
            onPick={(pos) => setSetting('humanSeatPosition', pos)}
          />
          <span className="text-[11px] text-slate-500">
            Seat {effectiveSeat + 1} of {seatCount} — drag your seat (or tap a
            spot). Later seats act after more cards are seen.
          </span>
        </section>

        <section className="flex flex-col gap-4 rounded-xl bg-slate-800/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Your hands</span>
            <MiniStepper
              value={numHands}
              min={1}
              max={5}
              onChange={(v) => setSetting('numHands', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Other players</span>
            <MiniStepper
              value={numOtherPlayers}
              min={0}
              max={6}
              onChange={(v) => setSetting('numOtherPlayers', v)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl bg-slate-800/60 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Counting aids
          </span>
          <div className="flex flex-wrap gap-2">
            <ToggleChip
              label="Running"
              on={showRunningCount}
              onClick={() => setSetting('showRunningCount', !showRunningCount)}
            />
            <ToggleChip
              label="True"
              on={showTrueCount}
              onClick={() => setSetting('showTrueCount', !showTrueCount)}
            />
            <ToggleChip
              label="Correct move"
              on={showCorrectMove}
              onClick={() => setSetting('showCorrectMove', !showCorrectMove)}
            />
          </div>
        </section>

        <button
          type="button"
          onClick={startPlayRound}
          className="mt-auto rounded-xl bg-emerald-500 py-4 text-lg font-bold text-emerald-950"
        >
          Deal
        </button>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Live table.
  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Bounded height (body already owns the safe-area insets) so overflow
        // scrolling stays inside this screen instead of the document.
        height: '100%',
        gap: 12,
        padding: 12,
        boxSizing: 'border-box',
        overflowY: 'auto',
        // Edge arc boxes may poke past the sides; never let that widen the
        // screen into a horizontal pan.
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Top bar: discard tray (top-left) + shoe + count pills + end. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <DiscardTray dealtFraction={dealtFraction} decks={decks} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 8,
            flex: '1 1 auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ShoeIndicator decks={decks} decksRemaining={decksRemaining} />
            <CountDisplay
              running={running}
              trueCount={displayTrueCount}
              showRunning={showRunningCount}
              showTrue={showTrueCount}
            />
            <button
              type="button"
              onClick={handleEnd}
              style={{
                padding: '8px 16px',
                minHeight: 44,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(0,0,0,0.25)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              End
            </button>
          </div>

          {/* Quick visibility toggles — surfaced in play, not buried in settings. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ToggleChip
              label="RC"
              on={showRunningCount}
              onClick={() => setSetting('showRunningCount', !showRunningCount)}
            />
            <ToggleChip
              label="TC"
              on={showTrueCount}
              onClick={() => setSetting('showTrueCount', !showTrueCount)}
            />
            <ToggleChip
              label="Correct"
              on={showCorrectMove}
              onClick={() => setSetting('showCorrectMove', !showCorrectMove)}
            />
          </div>
        </div>
      </header>

      {/* The table proper: dealer up top, betting boxes on a semicircle. */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: '1 1 auto',
        }}
      >
        <DealerArea dealer={dealer} placeholder={phase !== 'dealing'} />
        <TableArc
          seats={seats}
          botAction={botAction}
          // Spread mid-hand: the + button adds a box dealt from the next round.
          canAddHand={
            (phase === 'dealing' || phase === 'playerTurn' || phase === 'dealerTurn') &&
            numHands < 5
          }
          onAddHand={() => setSetting('numHands', Math.min(5, numHands + 1))}
          nextRoundHands={numHands}
        />
      </section>

      <HintBanner hint={hint} canShow={canShowHint} revealed={revealed} onShow={revealHint} />

      {/* Insurance offer: dealer shows an Ace, decision comes before the peek.
          The count pills above stay live, so this is a pure counting read. */}
      {phase === 'insurance' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(225, 177, 44, 0.45)', // chip-gold accent
          }}
        >
          <span style={{ color: '#fff', fontWeight: 700, textAlign: 'center' }}>
            Dealer shows an Ace — insurance?
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => takeInsurance(true)}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 10,
                border: 'none',
                background: '#e1b12c',
                color: '#1c1917',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              Take insurance
            </button>
            <button
              type="button"
              onClick={() => takeInsurance(false)}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'rgba(0,0,0,0.25)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              No insurance
            </button>
          </div>
        </div>
      )}

      {phase === 'roundOver' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {seats.flatMap((seat) =>
              seat.hands.map((hand) => (
                <div
                  key={hand.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontVariantNumeric: 'tabular-nums',
                    color: '#fff',
                  }}
                >
                  <span style={{ opacity: 0.85 }}>{seat.label}</span>
                  <span style={{ fontWeight: 600 }}>{OUTCOME_LABEL[hand.outcome]}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        hand.net > 0 ? '#34d399' : hand.net < 0 ? '#f87171' : '#e5e7eb',
                      minWidth: 56,
                      textAlign: 'right',
                    }}
                  >
                    {formatNet(hand.net)}
                  </span>
                </div>
              )),
            )}
            {/* Insurance settles separately from the hand results. */}
            {insuranceTaken && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: '#fff',
                }}
              >
                <span style={{ opacity: 0.85 }}>Insurance</span>
                <span style={{ fontWeight: 600 }}>{insuranceNet > 0 ? 'WIN' : 'LOSE'}</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: insuranceNet > 0 ? '#34d399' : '#f87171',
                    minWidth: 56,
                    textAlign: 'right',
                  }}
                >
                  {formatNet(insuranceNet)}
                </span>
              </div>
            )}
          </div>

          {/* Spread to more (or fewer) hands before the next deal — counters add
              hands as the count climbs. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 4,
            }}
          >
            <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
              Hands next round
            </span>
            <MiniStepper
              value={numHands}
              min={1}
              max={5}
              onChange={(v) => setSetting('numHands', v)}
            />
          </div>

          <button
            type="button"
            onClick={startPlayRound}
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            Next round
          </button>
        </div>
      )}

      {showActionBar && (
        <ActionBar legal={legalActions} onAction={(a: Action) => act(a)} disabled={!isHumanTurn} />
      )}
    </div>
  )
}
