import { useLayoutEffect, useRef, useState } from 'react'
import type { BotActionView, PlayerHandView, SeatView } from '@/types'
import HandView from '@/components/HandView'
import { computeTableLayout, type LayoutBoxInput } from '@/engine/tableLayout'

export interface TableArcProps {
  seats: SeatView[]
  botAction: BotActionView | null
  /** Show the in-hand "+" spread button. */
  canAddHand: boolean
  onAddHand: () => void
  /** Hands the human will play NEXT round (settings.numHands). */
  nextRoundHands: number
}

/** One betting box on the arc: a seat's hands grouped by boxId. */
interface Box {
  key: string
  seatIndex: number
  isHuman: boolean
  label: string
  hands: { hand: PlayerHandView; handIndex: number }[]
}

/**
 * The player side of the table, laid out like a real one: betting boxes on a
 * semicircular arc below the dealer. Center boxes sit closest to the viewer;
 * boxes toward the ends sit higher and angled toward the dealer. Sizing is
 * measured, not guessed: the container width feeds the pure layout engine
 * (engine/tableLayout), which keeps cards LARGE with a tight fan in the
 * normal view and only crunches the fan / shrinks a specific box when its
 * content would genuinely overflow — never past the screen edges.
 */
export default function TableArc({
  seats,
  botAction,
  canAddHand,
  onAddHand,
  nextRoundHands,
}: TableArcProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Flatten seats into boxes, keeping deal order. Split children share their
  // parent's boxId, so grouping by boxId keeps them in one slot on the arc.
  const boxes: Box[] = []
  seats.forEach((seat, seatIndex) => {
    const groups = new Map<string, { hand: PlayerHandView; handIndex: number }[]>()
    for (let handIndex = 0; handIndex < seat.hands.length; handIndex++) {
      const hand = seat.hands[handIndex]
      const g = groups.get(hand.boxId)
      if (g) g.push({ hand, handIndex })
      else groups.set(hand.boxId, [{ hand, handIndex }])
    }
    let boxNum = 0
    for (const [boxId, hands] of groups) {
      boxes.push({
        key: `${seat.id}:${boxId}`,
        seatIndex,
        isHuman: seat.isHuman,
        // Multi-box seats get numbered labels so the human can tell hands apart.
        label: groups.size > 1 ? `${seat.label} ${boxNum + 1}` : seat.label,
        hands,
      })
      boxNum++
    }
  })

  const humanBoxCount = boxes.filter((b) => b.isHuman).length
  const pendingHands = Math.max(0, nextRoundHands - humanBoxCount)

  const layoutInputs: LayoutBoxInput[] = boxes.map((b) => ({
    handCardCounts: b.hands.map(({ hand }) => hand.cards.length),
    isHuman: b.isHuman,
  }))
  // Before the first measurement (width 0) lay out against a phone-width
  // guess; the ResizeObserver corrects it on the very next frame.
  const layout = computeTableLayout(width || 360, layoutInputs)

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: layout.heightPx }}>
      {boxes.map((box, i) => {
        const pos = layout.boxes[i]
        const isBotActing = botAction !== null && botAction.seatIndex === box.seatIndex
        const hasActiveHand = box.hands.some(({ hand }) => hand.isActive)
        // The acting box must paint above everything (its badge/fresh card
        // can't escape the transform's stacking context), then the human.
        const zIndex = isBotActing || hasActiveHand ? 3 : box.isHuman ? 2 : 1
        return (
          <div
            key={box.key}
            className="absolute"
            style={{
              left: pos.xPx,
              top: pos.topPx,
              // Pin the DOM box to the engine's width model so the (wider)
              // settle chip row wraps inside it instead of widening the box.
              width: pos.naturalWidth,
              transform: `translateX(-50%) rotate(${pos.rotDeg}deg) scale(${pos.scale})`,
              transformOrigin: '50% 0%',
              zIndex,
            }}
          >
            {/* Label lives on the box (not the hand) so it survives splits. */}
            <div className="flex flex-col items-center">
              {box.hands.length > 1 && (
                <span className="text-[0.65rem] font-medium uppercase tracking-wider text-emerald-200/70">
                  {box.label}
                </span>
              )}
              <div className="flex items-start" style={{ marginLeft: 0 }}>
                {box.hands.map(({ hand, handIndex }, hi) => (
                  <div key={hand.id} style={{ marginLeft: hi > 0 ? -12 : 0 }}>
                    <HandView
                      hand={hand}
                      cardOverlapPx={pos.cardOverlapPx}
                      label={box.hands.length > 1 ? undefined : box.label}
                      actionBadge={
                        botAction &&
                        botAction.seatIndex === box.seatIndex &&
                        botAction.handIndex === handIndex
                          ? botAction.action
                          : null
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      {/* Spread mid-hand: the extra box is dealt from the NEXT round. Lives
          outside the scaled boxes so the tap target stays a full 44px and the
          human's cards don't shift when it appears/disappears. */}
      {(canAddHand || pendingHands > 0) && (
        <div className="absolute bottom-1 right-1 z-10 flex flex-col items-end gap-1">
          {canAddHand && (
            <button
              type="button"
              onClick={onAddHand}
              aria-label="Add a hand next round"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/90 text-2xl font-black text-emerald-950 shadow-md ring-2 ring-emerald-300/60 active:scale-95"
            >
              +
            </button>
          )}
          {pendingHands > 0 && (
            <span className="whitespace-nowrap rounded-full bg-black/40 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-200">
              +{pendingHands} next round
            </span>
          )}
        </div>
      )}
    </div>
  )
}
