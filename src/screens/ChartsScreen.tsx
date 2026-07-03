import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useUi } from '@/store/uiStore'
import { INSURANCE_STAT_KEY, useStats } from '@/store/statsStore'
import PlayingCard from '@/components/PlayingCard'
import { HARD, PAIRS, SOFT, UPCARDS, type CellCode } from '@/engine/basicStrategy'
import {
  indexPlaysForSpot,
  sampleCards,
  spotKey,
  type ChartKind,
  type ChartSpot,
} from '@/engine/chartSpots'
import { INDEX_PLAYS } from '@/engine/deviations'
import type { IndexPlay, UpcardValue } from '@/types'

// ============================================================================
// Strategy Charts screen: renders the exact HARD/SOFT/PAIRS tables the
// strategy resolver plays from, overlaid with the player's lifetime per-spot
// training accuracy (statsStore). Tapping a cell opens a detail overlay with
// a representative hand, the chart cell's full meaning, any matching Hi-Lo
// index play, and the player's stats for that exact spot.
// ============================================================================

// --- Palette ----------------------------------------------------------------
// Strategy-mode cell colors (letter code is always drawn too — color is never
// the only encoding). Conditional codes (Ds/Ph/Rs) share their base action's
// color and get a small corner marker instead of a different hue.
// Shades are the 600/700-level variants of the hue family so that white bold
// text clears WCAG AA 4.5:1 on every cell (measured: blue 5.2, amber 5.0,
// green 5.5, violet 5.7, rose 4.7) — the lighter 500-level shades all failed.
const CODE_COLOR: Record<CellCode, string> = {
  H: '#2563eb', // hit
  S: '#b45309', // stand
  D: '#047857', // double (else hit)
  Ds: '#047857', // double (else stand)
  P: '#7c3aed', // split
  Ph: '#7c3aed', // split (DAS only)
  R: '#e11d48', // surrender (else hit)
  Rs: '#e11d48', // surrender (else stand)
}

/** The single letter shown inside a cell (conditional codes show their base). */
const CODE_LETTER: Record<CellCode, string> = {
  H: 'H', S: 'S', D: 'D', Ds: 'D', P: 'P', Ph: 'P', R: 'R', Rs: 'R',
}

/** Short action name, for aria-labels and the legend. */
const CODE_SHORT: Record<CellCode, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double',
  Ds: 'Double',
  P: 'Split',
  Ph: 'Split',
  R: 'Surrender',
  Rs: 'Surrender',
}

/** Full cell meaning, spelled out in the detail overlay. */
const CODE_MEANING: Record<CellCode, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double if allowed, otherwise hit',
  Ds: 'Double if allowed, otherwise stand',
  P: 'Split',
  Ph: 'Split only when double-after-split is allowed, otherwise play as the total',
  R: 'Surrender if allowed, otherwise hit',
  Rs: 'Surrender if allowed, otherwise stand',
}

// Accuracy-mode buckets. Text (the % under the letter) is the secondary
// encoding, so color-blind users still read the number. Buckets key on the
// same ROUNDED integer percent the cell displays — bucketing on the raw ratio
// would let 84.6% render "85%" on an amber cell while the legend calls >= 85%
// green. Bucket colors picked for >= 4.5:1 contrast under white text, like
// CODE_COLOR above.
const UNTRAINED_BG = 'rgba(148, 163, 184, 0.15)'
const ACC_RED = '#e11d48' // < 60%
const ACC_AMBER = '#b45309' // 60–84%
const ACC_GREEN = '#047857' // >= 85%
function accuracyColor(attempts: number, pct: number): string {
  if (attempts === 0) return UNTRAINED_BG
  if (pct < 60) return ACC_RED
  if (pct < 85) return ACC_AMBER
  return ACC_GREEN
}

// --- Chart metadata -----------------------------------------------------------
const TABLES: Record<ChartKind, Record<number, CellCode[]>> = {
  hard: HARD,
  soft: SOFT,
  pair: PAIRS,
}

const TABS: { kind: ChartKind; label: string }[] = [
  { kind: 'hard', label: 'Hard' },
  { kind: 'soft', label: 'Soft' },
  { kind: 'pair', label: 'Pairs' },
]

function upcardLabel(u: UpcardValue): string {
  return u === 11 ? 'A' : String(u)
}

function pairCardLabel(value: number): string {
  return value === 11 ? 'A' : String(value)
}

/** Compact left-column label: "16" / "A,7" / "8,8". */
function rowLabel(kind: ChartKind, row: number): string {
  if (kind === 'hard') return String(row)
  if (kind === 'soft') return `A,${row - 11}`
  return `${pairCardLabel(row)},${pairCardLabel(row)}`
}

/** Detail-overlay title: "Hard 16 vs 10" / "Soft 18 vs 3" / "8,8 vs A". */
function spotTitle(spot: ChartSpot): string {
  const vs = upcardLabel(spot.upcard)
  if (spot.kind === 'hard') return `Hard ${spot.row} vs ${vs}`
  if (spot.kind === 'soft') return `Soft ${spot.row} vs ${vs}`
  return `${pairCardLabel(spot.row)},${pairCardLabel(spot.row)} vs ${vs}`
}

/**
 * Compact in-cell tag for an index play: "≥0" (deviate when TC >= 0) or
 * "≤-1" (deviate when TC <= -1) — the corner-number convention of printed
 * index charts, with the comparator made explicit.
 */
function indexTag(play: IndexPlay): string {
  return `${play.comparator === 'gte' ? '≥' : '≤'}${play.index}`
}

/** Spoken row name for aria-labels: "Hard 16" / "Soft 18" / "Pair of 8s". */
function spokenRow(kind: ChartKind, row: number): string {
  if (kind === 'hard') return `Hard ${row}`
  if (kind === 'soft') return `Soft ${row}`
  return `Pair of ${row === 11 ? 'aces' : `${row}s`}`
}

/**
 * Numeric row keys of a table, descending (Object.keys gives strings): the
 * grid renders highest total at the top, lowest at the bottom, so scanning
 * down the chart follows a hand getting weaker.
 */
function rowsOf(kind: ChartKind): number[] {
  return Object.keys(TABLES[kind])
    .map(Number)
    .sort((a, b) => b - a)
}

// ============================================================================

type ColorMode = 'strategy' | 'accuracy'

export default function ChartsScreen() {
  const go = useUi((s) => s.go)
  const spots = useStats((s) => s.spots)

  const [kind, setKind] = useState<ChartKind>('hard')
  const [colorMode, setColorMode] = useState<ColorMode>('strategy')
  const [selected, setSelected] = useState<ChartSpot | null>(null)

  const rows = rowsOf(kind)
  const table = TABLES[kind]

  // Per-chart summary: trained cells + overall accuracy across the visible tab.
  let trainedCells = 0
  let sumAttempts = 0
  let sumCorrect = 0
  for (const row of rows) {
    for (const up of UPCARDS) {
      const stat = spots[spotKey({ kind, row, upcard: up })]
      if (stat && stat.attempts > 0) {
        trainedCells++
        sumAttempts += stat.attempts
        sumCorrect += stat.correct
      }
    }
  }
  const totalCells = rows.length * UPCARDS.length
  const overallPct = sumAttempts > 0 ? Math.round((sumCorrect / sumAttempts) * 100) : null

  const insurancePlay = INDEX_PLAYS.find((p) => p.kind === 'insurance')

  const handleReset = () => {
    if (window.confirm('Reset all chart training stats? This cannot be undone.')) {
      useStats.getState().resetStats()
    }
  }

  return (
    <div
      style={{
        // Self-scrolling screen (SettingsScreen pattern): keeps iOS
        // rubber-banding contained instead of scrolling the document. The felt
        // background comes from App/body — no override here.
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        style={{
          padding: 16,
          boxSizing: 'border-box',
          maxWidth: 560,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => go('home')}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#f4f4f5',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            ‹ Back
          </button>
          <h1 style={{ margin: 0, fontSize: 22 }}>Strategy Charts</h1>
        </header>

        {/* Hard / Soft / Pairs chart picker. Deliberately plain toggle buttons
            (aria-pressed), NOT role=tablist/tab: the ARIA tabs pattern promises
            arrow-key navigation, roving tabindex and labelled tabpanels, which
            these simple state toggles don't implement. */}
        <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Chart type">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              aria-pressed={kind === t.kind}
              onClick={() => setKind(t.kind)}
              style={segButton(kind === t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Color-mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Color by
          </span>
          {/* aria-pressed carries the active mode to AT — the inline border/
              background difference is invisible to screen readers. */}
          <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Color by">
            <button
              type="button"
              aria-pressed={colorMode === 'strategy'}
              onClick={() => setColorMode('strategy')}
              style={pillButton(colorMode === 'strategy')}
            >
              Strategy
            </button>
            <button
              type="button"
              aria-pressed={colorMode === 'accuracy'}
              onClick={() => setColorMode('accuracy')}
              style={pillButton(colorMode === 'accuracy')}
            >
              Accuracy
            </button>
          </div>
        </div>

        {/* The chart grid. Horizontal scroll lives on this wrapper so the page
            body itself never scrolls sideways on narrow phones. */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div
            style={{
              display: 'grid',
              // 44px minimum cell columns keep tap targets at the iOS 44pt
              // floor; on narrow phones the grid grows past the viewport and
              // the wrapper above scrolls it instead of shrinking the targets.
              gridTemplateColumns: `40px repeat(${UPCARDS.length}, minmax(44px, 1fr))`,
              gap: 2, // the 2px surface gap doubles as the mark spacer
            }}
          >
            {/* Header row: dealer upcards */}
            <div style={headerCell} aria-hidden>
              vs
            </div>
            {UPCARDS.map((u) => (
              <div key={`h-${u}`} style={headerCell} aria-hidden>
                {upcardLabel(u)}
              </div>
            ))}

            {rows.map((row) => (
              // React fragments keyed per row keep the grid flat (CSS grid
              // needs direct children).
              <RowCells
                key={`${kind}-${row}`}
                kind={kind}
                row={row}
                codes={table[row]}
                colorMode={colorMode}
                spots={spots}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>

        {/* Legend for the active color mode */}
        {colorMode === 'strategy' ? (
          <div style={legendRow}>
            <LegendSwatch color={CODE_COLOR.H} label="H Hit" />
            <LegendSwatch color={CODE_COLOR.S} label="S Stand" />
            <LegendSwatch color={CODE_COLOR.D} label="D Double" />
            <LegendSwatch color={CODE_COLOR.P} label="P Split" />
            <LegendSwatch color={CODE_COLOR.R} label="R Surrender" />
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>▘ = conditional (see detail)</span>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>≥n / ≤n = deviate at that TC</span>
          </div>
        ) : (
          <div style={legendRow}>
            <LegendSwatch color={UNTRAINED_BG} label="Untrained" />
            <LegendSwatch color={ACC_RED} label="< 60%" />
            <LegendSwatch color={ACC_AMBER} label="60–84%" />
            <LegendSwatch color={ACC_GREEN} label="≥ 85%" />
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>≥n / ≤n = deviate at that TC</span>
          </div>
        )}

        {/* Per-chart summary */}
        <p style={{ margin: 0, fontSize: 13, color: '#d4d4d8' }} className="tabular">
          Trained {trainedCells}/{totalCells} spots
          {overallPct !== null ? ` · ${overallPct}% overall` : ''}
        </p>

        {/* Footer: insurance index note + stats reset */}
        <div
          style={{
            marginTop: 4,
            paddingTop: 12,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {insurancePlay && (
            <p style={{ margin: 0, fontSize: 13, color: '#a1a1aa' }} className="tabular">
              Insurance: {insurancePlay.description}
              {(() => {
                // Lifetime insurance accuracy (recorded by Play mode's offer,
                // keyed separately since insurance has no chart cell).
                const s = spots[INSURANCE_STAT_KEY]
                if (!s || s.attempts === 0) return null
                const pct = Math.round((s.correct / s.attempts) * 100)
                return ` · ${s.attempts} attempt${s.attempts === 1 ? '' : 's'} · ${pct}%`
              })()}
            </p>
          )}
          <button
            type="button"
            onClick={handleReset}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(248, 113, 113, 0.4)',
              background: 'transparent',
              color: '#f87171',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Reset chart stats
          </button>
        </div>
      </div>

      {selected && <SpotDetail spot={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// --- Grid row ----------------------------------------------------------------

function RowCells({
  kind,
  row,
  codes,
  colorMode,
  spots,
  onSelect,
}: {
  kind: ChartKind
  row: number
  codes: CellCode[]
  colorMode: ColorMode
  spots: Record<string, { attempts: number; correct: number }>
  onSelect: (spot: ChartSpot) => void
}) {
  return (
    <>
      <div style={rowLabelCell} aria-hidden>
        {rowLabel(kind, row)}
      </div>
      {UPCARDS.map((up, i) => {
        const code = codes[i]
        const spot: ChartSpot = { kind, row, upcard: up }
        const stat = spots[spotKey(spot)]
        const attempts = stat?.attempts ?? 0
        const accuracy = attempts > 0 ? stat!.correct / attempts : 0
        const pct = Math.round(accuracy * 100)

        const accuracyMode = colorMode === 'accuracy'
        const bg = accuracyMode ? accuracyColor(attempts, pct) : CODE_COLOR[code]
        // In accuracy mode an untrained cell dims its letter — the cell is
        // "empty" until it has data; everywhere else the letter is bold white.
        const letterColor =
          accuracyMode && attempts === 0 ? 'rgba(255, 255, 255, 0.45)' : '#ffffff'
        const conditional = code === 'Ds' || code === 'Ph' || code === 'Rs'
        const play = indexPlaysForSpot(spot)[0]

        const aria =
          `${spokenRow(kind, row)} versus ${up === 11 ? 'ace' : up}: ${CODE_SHORT[code]}, ` +
          (attempts > 0
            ? `accuracy ${pct} percent over ${attempts} attempt${attempts === 1 ? '' : 's'}`
            : 'not trained yet') +
          (play ? `, deviation: ${play.description}` : '')

        return (
          <button
            key={`${kind}-${row}-${up}`}
            type="button"
            aria-label={aria}
            onClick={() => onSelect(spot)}
            style={{
              position: 'relative',
              // 44px matches the grid's minmax(44px, 1fr) columns — the whole
              // cell is a tap target at the iOS 44pt minimum.
              minHeight: 44,
              minWidth: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0,
              padding: 0,
              border: 'none',
              borderRadius: 6,
              background: bg,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1, color: letterColor }}>
              {CODE_LETTER[code]}
            </span>
            {/* Percent is the secondary (text) encoding of accuracy — the
                color-blind-safe channel — so it stays near-solid white in both
                modes: at 9px, dimmer alphas drop below AA contrast on the
                amber cells. Strategy mode deemphasizes with weight, not color. */}
            {attempts > 0 && (
              <span
                className="tabular"
                style={{
                  fontSize: 9,
                  lineHeight: 1.2,
                  fontWeight: accuracyMode ? 700 : 600,
                  color: accuracyMode ? '#ffffff' : 'rgba(255, 255, 255, 0.95)',
                }}
              >
                {pct}%
              </span>
            )}
            {/* Corner marker for conditional codes (Ds / Ph / Rs). */}
            {conditional && !accuracyMode && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 2,
                  width: 5,
                  height: 5,
                  borderRadius: 1,
                  background: 'rgba(255, 255, 255, 0.7)',
                }}
              />
            )}
            {/* Index-play tag (printed-chart corner-number convention). Shown
                in both color modes; the detail overlay carries the full
                description, and the aria-label already speaks it. */}
            {play && (
              <span
                aria-hidden
                className="tabular"
                style={{
                  position: 'absolute',
                  top: 1,
                  right: 2,
                  fontSize: 8,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  // Follow the letter's dimming on untrained accuracy cells.
                  color: letterColor,
                }}
              >
                {indexTag(play)}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

// --- Detail overlay ------------------------------------------------------------

function SpotDetail({ spot, onClose }: { spot: ChartSpot; onClose: () => void }) {
  const stat = useStats((s) => s.spots[spotKey(spot)])
  const code = TABLES[spot.kind][spot.row][UPCARDS.indexOf(spot.upcard)]
  const { player, dealer } = sampleCards(spot)
  const plays = indexPlaysForSpot(spot)

  // aria-modal promises AT users that the background is inert, so the dialog
  // has to actually behave that way: move focus in on open, keep Tab cycling
  // inside, close on Escape, and hand focus back to the opener on close.
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose is recreated on every parent render; route through a ref so the
  // mount-once effect below always calls the latest one.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      // Minimal focus trap: wrap Tab / Shift+Tab at the dialog's edges.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (!panelRef.current.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [])

  const attempts = stat?.attempts ?? 0
  const correct = stat?.correct ?? 0
  const misses = attempts - correct
  const pct = attempts > 0 ? Math.round((correct / attempts) * 100) : 0

  return (
    // Backdrop: tap outside the panel dismisses. z-index stays below the
    // rotate-overlay's 9999 so orientation warnings still win.
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={spotTitle(spot)}
        // Focusable so the open effect can move focus into the dialog (the
        // panel itself is the initial focus target, per the modal pattern).
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          maxHeight: '85%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          background: '#0b2f1d',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 16,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxSizing: 'border-box',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{spotTitle(spot)}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#f4f4f5',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            ✕
          </button>
        </div>

        {/* Representative cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={cardRowLabel}>Dealer</span>
            <PlayingCard card={dealer} size="md" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={cardRowLabel}>You</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {player.map((c) => (
                <PlayingCard key={c.id} card={c} size="md" />
              ))}
            </div>
          </div>
        </div>

        {/* Correct play */}
        <div style={panel}>
          <span style={panelLabel}>Correct play</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: 6,
                background: CODE_COLOR[code],
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {CODE_LETTER[code]}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{CODE_MEANING[code]}</span>
          </div>
        </div>

        {/* Index-play deviations */}
        <div style={panel}>
          <span style={panelLabel}>Deviations</span>
          {plays.length > 0 ? (
            plays.map((p) => (
              <p key={p.id} style={{ margin: 0, fontSize: 14, color: '#d4d4d8' }}>
                {p.description}
              </p>
            ))
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: '#a1a1aa' }}>No index play</p>
          )}
        </div>

        {/* Lifetime stats */}
        <div style={panel}>
          <span style={panelLabel}>Your stats</span>
          {attempts > 0 ? (
            <>
              <p className="tabular" style={{ margin: 0, fontSize: 14, color: '#d4d4d8' }}>
                {attempts} attempt{attempts === 1 ? '' : 's'} · {correct} correct · {misses}{' '}
                miss{misses === 1 ? '' : 'es'} · {pct}%
              </p>
              {/* Thin accuracy meter — the % text above is the primary encoding. */}
              <div
                aria-hidden
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: 'rgba(255, 255, 255, 0.12)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 2,
                    background: accuracyColor(attempts, pct),
                  }}
                />
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: '#a1a1aa' }}>Not trained yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Shared styles -------------------------------------------------------------

const headerCell: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 24,
  fontSize: 11,
  fontWeight: 700,
  color: '#a1a1aa',
  textTransform: 'uppercase',
}

const rowLabelCell: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  color: '#d4d4d8',
  fontVariantNumeric: 'tabular-nums',
}

const legendRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
}

const panel: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const panelLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: '#a1a1aa',
}

const cardRowLabel: CSSProperties = {
  width: 48,
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: 'rgba(167, 243, 208, 0.7)', // matches DealerArea's emerald label tint
}

function segButton(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    border: active ? '2px solid #34d399' : '2px solid transparent',
    background: active ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255, 255, 255, 0.08)',
    color: '#f4f4f5',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    touchAction: 'manipulation',
  }
}

function pillButton(active: boolean): CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? '1.5px solid rgba(255, 255, 255, 0.6)' : '1.5px solid transparent',
    background: active ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.06)',
    color: '#f4f4f5',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    touchAction: 'manipulation',
  }
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#d4d4d8' }}>
      <span
        aria-hidden
        style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }}
      />
      {label}
    </span>
  )
}
