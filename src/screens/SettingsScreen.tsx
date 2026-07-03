import { useEffect, type ReactNode } from 'react'
import type { Ruleset } from '@/types'
import { useSettings } from '@/store/settingsStore'
import { useUi } from '@/store/uiStore'

// ----------------------------------------------------------------------------
// Small presentational primitives, local to this screen.
// ----------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: '#1b2433',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 13,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: '#7b8aa3',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, color: '#e8edf5' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: '#7b8aa3' }}>{hint}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        // 44pt-tall hit area (iOS HIG minimum) around a 52x30 visual pill.
        width: 52,
        height: 44,
        border: 'none',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        background: 'transparent',
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          padding: 3,
          background: on ? '#2f9e6b' : '#3a465a',
          transition: 'background 120ms ease',
          display: 'flex',
          justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}
        />
      </span>
    </button>
  )
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (next: number) => void
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const btn = (label: string, target: number, enabled: boolean) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onChange(clamp(target))}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        border: 'none',
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 1,
        cursor: enabled ? 'pointer' : 'default',
        background: enabled ? '#3a465a' : '#2a3344',
        color: enabled ? '#e8edf5' : '#56627a',
      }}
    >
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {btn('-', value - 1, value > min)}
      <span
        style={{
          minWidth: 28,
          textAlign: 'center',
          fontSize: 18,
          fontWeight: 600,
          color: '#e8edf5',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      {btn('+', value + 1, value < max)}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Screen.
// ----------------------------------------------------------------------------

export default function SettingsScreen() {
  // Subscribe field-by-field so changes re-render; `set` is stable from zustand.
  const ruleset = useSettings((s) => s.ruleset)
  const decks = useSettings((s) => s.decks)
  const surrenderEnabled = useSettings((s) => s.surrenderEnabled)
  const dasEnabled = useSettings((s) => s.dasEnabled)
  const showRunningCount = useSettings((s) => s.showRunningCount)
  const showTrueCount = useSettings((s) => s.showTrueCount)
  const showCorrectMove = useSettings((s) => s.showCorrectMove)
  const numHands = useSettings((s) => s.numHands)
  const numOtherPlayers = useSettings((s) => s.numOtherPlayers)
  const penetration = useSettings((s) => s.penetration)
  const dealSpeed = useSettings((s) => s.dealSpeed)
  const showHandTotals = useSettings((s) => s.showHandTotals)
  const drillFalseSpots = useSettings((s) => s.drillFalseSpots)
  const trainHard = useSettings((s) => s.trainHard)
  const trainSoft = useSettings((s) => s.trainSoft)
  const trainPairs = useSettings((s) => s.trainPairs)
  const deviationRangeEnabled = useSettings((s) => s.deviationRangeEnabled)
  const deviationRangeMin = useSettings((s) => s.deviationRangeMin)
  const deviationRangeMax = useSettings((s) => s.deviationRangeMax)
  const set = useSettings((s) => s.set)

  const go = useUi((s) => s.go)

  // Match the page background (which shows through the iOS safe-area strips on
  // notched iPhones in standalone mode) to this screen's dark surface.
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#0f1623'
    return () => {
      document.body.style.background = prev
    }
  }, [])

  const rulesetButton = (value: Ruleset, label: string, comingSoon: boolean) => {
    const active = ruleset === value
    return (
      <button
        type="button"
        disabled={comingSoon}
        onClick={() => set('ruleset', value)}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: active ? '2px solid #2f9e6b' : '2px solid transparent',
          background: active ? '#21513c' : '#3a465a',
          color: comingSoon ? '#56627a' : '#e8edf5',
          fontSize: 14,
          fontWeight: 600,
          cursor: comingSoon ? 'default' : 'pointer',
          opacity: comingSoon ? 0.6 : 1,
        }}
      >
        {label}
        {comingSoon && (
          <span style={{ display: 'block', fontSize: 10, fontWeight: 400, marginTop: 2 }}>
            coming soon
          </span>
        )}
      </button>
    )
  }

  const pct = Math.round(penetration * 100)

  // The dealing-speed slider shows a speed factor (right = faster), while the
  // setting stores its inverse: a delay multiplier on every dealing step.
  const speedFactor = Math.min(2.5, Math.max(0.5, 1 / (dealSpeed || 1)))

  return (
    <div
      style={{
        // Self-scrolling screen: keeps iOS rubber-banding / pull-to-refresh
        // contained instead of scrolling the document.
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        background: '#0f1623',
        color: '#e8edf5',
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
          gap: 16,
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
              background: '#3a465a',
              color: '#e8edf5',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ‹ Back
          </button>
          <h1 style={{ margin: 0, fontSize: 22 }}>Settings</h1>
        </header>

        <Section title="Rules">
          <Row label="Ruleset" hint="Dealer stands / hits on soft 17">
            <div style={{ display: 'flex', gap: 8 }}>
              {rulesetButton('S17', 'S17', false)}
              {rulesetButton('H17', 'H17', true)}
            </div>
          </Row>
          <Row label="Decks" hint="Shoe size (1–8)">
            <Stepper value={decks} min={1} max={8} onChange={(v) => set('decks', v)} />
          </Row>
          <Row label="Surrender" hint="Late surrender allowed">
            <Toggle on={surrenderEnabled} onChange={(v) => set('surrenderEnabled', v)} />
          </Row>
          <Row label="Double after split" hint="DAS — affects basic strategy">
            <Toggle on={dasEnabled} onChange={(v) => set('dasEnabled', v)} />
          </Row>
        </Section>

        <Section title="Display">
          <Row label="Running count" hint="Show RC on the table">
            <Toggle on={showRunningCount} onChange={(v) => set('showRunningCount', v)} />
          </Row>
          <Row label="True count" hint="Show TC on the table">
            <Toggle on={showTrueCount} onChange={(v) => set('showTrueCount', v)} />
          </Row>
          <Row label="Show correct move" hint="Enable the in-hand hint button">
            <Toggle on={showCorrectMove} onChange={(v) => set('showCorrectMove', v)} />
          </Row>
          <Row label="Hand totals" hint="Show the total under each hand (e.g. 16 under 7♥ 9♥)">
            <Toggle on={showHandTotals} onChange={(v) => set('showHandTotals', v)} />
          </Row>
        </Section>

        <Section title="Table">
          <Row label="Dealing speed" hint="Pace of the deal, bot turns, and dealer draws">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={speedFactor}
                onChange={(e) => {
                  const f = Number(e.target.value)
                  set('dealSpeed', Math.round((1 / f) * 1000) / 1000)
                }}
                aria-label="Dealing speed"
                style={{ width: 140 }}
              />
              <span
                style={{
                  minWidth: 44,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              >
                {speedFactor.toFixed(1)}×
              </span>
            </div>
          </Row>
          <Row label="Your hands" hint="Boxes you play (1–5)">
            <Stepper value={numHands} min={1} max={5} onChange={(v) => set('numHands', v)} />
          </Row>
          <Row label="Other players" hint="Bots seated (0–6); 7 seats total">
            <Stepper
              value={numOtherPlayers}
              min={0}
              max={6}
              onChange={(v) => set('numOtherPlayers', v)}
            />
          </Row>
          <Row label="Penetration" hint={`Cut card at ${pct}% of the shoe`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={pct}
                onChange={(e) => set('penetration', Number(e.target.value) / 100)}
                style={{ width: 140 }}
              />
              <span
                style={{
                  minWidth: 44,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                }}
              >
                {pct}%
              </span>
            </div>
          </Row>
        </Section>

        <Section title="Hand types">
          {(() => {
            // Never allow all three off: lock the last enabled toggle so the
            // filter can't collapse to "deal nothing".
            const enabledCount = [trainHard, trainSoft, trainPairs].filter(Boolean).length
            const lock = (on: boolean) => on && enabledCount === 1
            return (
              <>
                <Row label="Hard hands" hint="Your deals & drill spots include hard totals">
                  <Toggle
                    on={trainHard}
                    disabled={lock(trainHard)}
                    onChange={(v) => set('trainHard', v)}
                  />
                </Row>
                <Row label="Soft hands" hint="Include ace-counting-as-11 hands">
                  <Toggle
                    on={trainSoft}
                    disabled={lock(trainSoft)}
                    onChange={(v) => set('trainSoft', v)}
                  />
                </Row>
                <Row label="Pairs" hint="Include pairs (tens count as a pair)">
                  <Toggle
                    on={trainPairs}
                    disabled={lock(trainPairs)}
                    onChange={(v) => set('trainPairs', v)}
                  />
                </Row>
                <span style={{ fontSize: 12, color: '#7b8aa3' }}>
                  Applies to the hands YOU are dealt in Play and to both drills. Bots and the
                  dealer are unaffected.
                </span>
              </>
            )
          })()}
        </Section>

        <Section title="Deviations">
          <Row
            label="False deviation spots"
            hint="Drill mixes in look-alike hands with no index — basic strategy stays correct"
          >
            <Toggle on={drillFalseSpots} onChange={(v) => set('drillFalseSpots', v)} />
          </Row>
          <Row label="Limit deviation range" hint="Only train indices within a true-count window">
            <Toggle
              on={deviationRangeEnabled}
              onChange={(v) => set('deviationRangeEnabled', v)}
            />
          </Row>
          {deviationRangeEnabled && (
            <>
              <Row label="Lowest index" hint="Ignore deviations below this true count">
                <Stepper
                  value={deviationRangeMin}
                  min={-10}
                  max={0}
                  onChange={(v) => set('deviationRangeMin', Math.min(v, deviationRangeMax))}
                />
              </Row>
              <Row label="Highest index" hint="Ignore deviations above this true count">
                <Stepper
                  value={deviationRangeMax}
                  min={0}
                  max={12}
                  onChange={(v) => set('deviationRangeMax', Math.max(v, deviationRangeMin))}
                />
              </Row>
            </>
          )}
        </Section>

        <button
          type="button"
          onClick={() => useSettings.getState().reset()}
          style={{
            marginTop: 4,
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #5a3a3a',
            background: 'transparent',
            color: '#e88',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
