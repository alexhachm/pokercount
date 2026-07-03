// ============================================================================
// Table layout math (pure, unit-testable — no DOM).
//
// Goal: in the normal view (few boxes, 2-3 card hands) the cards render LARGE
// with a tight fan; sizes and spacing only come down when a specific box's
// content would actually overflow its share of the screen, and never past the
// screen edges. TableArc measures its container and feeds the width in here.
// ============================================================================

export interface LayoutBoxInput {
  /** Cards in each hand of this box (split boxes have 2-4 hands). */
  handCardCounts: number[]
  isHuman: boolean
}

export interface LayoutBox {
  /** Box center, px from the container's left edge. */
  xPx: number
  topPx: number
  rotDeg: number
  scale: number
  /** Horizontal overlap between adjacent cards within a hand, px (unscaled). */
  cardOverlapPx: number
  /** Natural (unscaled) content width, px — exposed for tests. */
  naturalWidth: number
}

export interface TableLayout {
  boxes: LayoutBox[]
  /** Height the arc container needs to fit every scaled box, px. */
  heightPx: number
}

// Geometry of the pieces being laid out (kept in sync with the components):
export const CARD_W = 64 // PlayingCard "md" width (w-16)
export const HAND_PAD = 16 // HandView p-2, both sides
export const SPLIT_OVERLAP = 12 // hands within a split box overlap this much
export const BASE_CARD_OVERLAP = 40 // tight fan: 24px of each buried card shows
export const MAX_CARD_OVERLAP = 52 // crunch limit: the corner index stays legible
/**
 * Estimated unscaled box content height. TableArc pins each box to its
 * naturalWidth, so the settle chip row (WIN/net — wider than a 2-card fan)
 * wraps below the cards instead of widening the box; this covers card +
 * label + total badge + one wrapped chip line.
 */
const BOX_H = 185
/** Keep at least this margin to each screen edge. */
const EDGE = 4

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Unscaled width of one hand fanned at `overlap`. Empty boxes show a card-size outline. */
function handWidth(cards: number, overlap: number): number {
  const c = Math.max(1, cards)
  return CARD_W + (c - 1) * (CARD_W - overlap)
}

/** Unscaled width of a whole box (hands side by side, padding included). */
export function boxWidth(handCardCounts: number[], overlap: number): number {
  const hands = handCardCounts.length
  const sum = handCardCounts.reduce((w, c) => w + handWidth(c, overlap) + HAND_PAD, 0)
  return sum - SPLIT_OVERLAP * (hands - 1)
}

/**
 * Lay the boxes on the arc for a container `width` px wide.
 *
 * Sizing strategy, per box:
 * 1. Start from a generous target scale (bigger when the table is emptier).
 * 2. If the box is too wide for its slot, tighten the card fan first
 *    (BASE→MAX overlap) — long hands crunch before anything shrinks.
 * 3. Only then reduce the scale to fit, never below a readability floor —
 *    EXCEPT the hard screen-fit cap, which always wins so nothing ever
 *    pushes past the container edges.
 */
export function computeTableLayout(width: number, inputs: LayoutBoxInput[]): TableLayout {
  const n = inputs.length
  if (n === 0 || width <= 0) return { boxes: [], heightPx: 200 }

  // Arc shape. Small tables cluster near the center; the span grows with n.
  const spanPct = Math.min(38, 14 + n * 6)
  const dropBase = n > 5 ? 46 : 58
  const crowded = n > 7

  // The "normal view is big" dial: target scale before any fitting.
  const target =
    n <= 2 ? 1.3 : n === 3 ? 1.2 : n === 4 ? 1.1 : n === 5 ? 1.0 : n <= 7 ? 0.88 : 0.78
  // Below this, a box is hard to read — prefer crunching the fan instead.
  const floor = 0.55

  // Each box's share of the arc. Boxes may borrow into neighbors (they
  // vertically stagger and the acting box paints on top), hence the 1.6.
  const slot =
    n === 1 ? width * 0.92 : ((width * (2 * spanPct)) / 100 / (n - 1)) * 1.6

  const boxes = inputs.map((input, i) => {
    const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1
    const rotDeg = -t * 13
    const cos = Math.cos((Math.abs(rotDeg) * Math.PI) / 180)
    const sin = Math.sin((Math.abs(rotDeg) * Math.PI) / 180)

    let scale = target * (1 - 0.1 * Math.abs(t)) * (input.isHuman ? 1 : 0.95)
    let overlap = BASE_CARD_OVERLAP

    // Widest the scaled, rotated box may render: its slot (soft budget) but
    // never wider than the screen (hard cap).
    const capW = Math.min(Math.max(slot, 140), width - 2 * EDGE)

    // Stage 1: crunch the fan. boxWidth is linear in overlap with slope
    // -Σ(cards-1), so solve for the overlap that fits, then clamp.
    const slope = input.handCardCounts.reduce((s, c) => s + Math.max(0, c - 1), 0)
    const fits = (o: number, s: number) =>
      (boxWidth(input.handCardCounts, o) * cos + BOX_H * sin) * s <= capW
    if (!fits(overlap, scale) && slope > 0) {
      const need =
        (boxWidth(input.handCardCounts, 0) * cos + BOX_H * sin - capW / scale / 1) / (cos * slope)
      overlap = clamp(Math.ceil(need), BASE_CARD_OVERLAP, MAX_CARD_OVERLAP)
    }
    // Stage 2: shrink to the slot, respecting the readability floor.
    if (!fits(overlap, scale)) {
      const w = boxWidth(input.handCardCounts, overlap) * cos + BOX_H * sin
      scale = Math.max(floor, capW / w)
    }
    // Stage 3: the screen edge always wins, floor or not.
    {
      const w = boxWidth(input.handCardCounts, overlap) * cos + BOX_H * sin
      const screenCap = width - 2 * EDGE
      if (w * scale > screenCap) scale = screenCap / w
    }

    const natural = boxWidth(input.handCardCounts, overlap)
    // Rotation happens about the box's TOP-CENTER (transformOrigin '50% 0%'),
    // so the rotated bounding box is asymmetric around xPx: a clockwise tilt
    // (rot > 0, left arc) swings the bottom edge left, adding the full
    // BOX_H·sin to the LEFT extent only — and vice versa. Clamp per side.
    const extL = (((natural / 2) * cos + (rotDeg > 0 ? BOX_H * sin : 0)) * scale)
    const extR = (((natural / 2) * cos + (rotDeg < 0 ? BOX_H * sin : 0)) * scale)
    const xIdeal = (width * (50 + t * spanPct)) / 100
    const lo = EDGE + extL
    const hi = width - EDGE - extR
    // A box wider than the screen splits its overflow evenly.
    const xPx = lo <= hi ? clamp(xIdeal, lo, hi) : (lo + hi) / 2

    // The same tilt raises one TOP corner above the origin by (W/2)·sin;
    // push the box down by that so it never paints up into the dealer area.
    const topRaise = (natural / 2) * sin * scale
    const topPx = (1 - t * t) * dropBase + (crowded ? (i % 2) * 28 : 0) + topRaise

    return { xPx, topPx, rotDeg, scale, cardOverlapPx: overlap, naturalWidth: natural }
  })

  // Rotated vertical extent below the origin: H·cos plus the bottom corner's
  // (W/2)·sin swing (topPx already absorbed the corner above the origin).
  const heightPx = Math.max(
    200,
    ...boxes.map((b) => {
      const sin = Math.sin((Math.abs(b.rotDeg) * Math.PI) / 180)
      const cos = Math.cos((Math.abs(b.rotDeg) * Math.PI) / 180)
      const below = (BOX_H * cos + (b.naturalWidth / 2) * sin) * b.scale
      return b.topPx + below + 8
    }),
  )
  return { boxes, heightPx }
}
