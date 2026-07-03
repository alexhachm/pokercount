import { useGame } from '@/store/gameStore'
import { useSettings } from '@/store/settingsStore'
import { useUi } from '@/store/uiStore'

/**
 * Home / landing screen. Entry point into the two session modes and settings.
 * Buttons drive imperative store actions via getState() so the screen itself
 * does not need to subscribe to the game store.
 */
export default function HomeScreen() {
  // Subscribe to just the settings fields shown in the summary.
  const decks = useSettings((s) => s.decks)
  const ruleset = useSettings((s) => s.ruleset)
  const surrenderEnabled = useSettings((s) => s.surrenderEnabled)
  const showRunningCount = useSettings((s) => s.showRunningCount)
  const showTrueCount = useSettings((s) => s.showTrueCount)

  const handlePlay = () => {
    // Enter the Play screen in its idle/table-setup state; the user deals from
    // there after choosing seat, hands, and other players.
    useGame.getState().resetSession()
    useUi.getState().go('play')
  }

  const handleDrill = () => {
    useGame.getState().startDrillSession()
    useUi.getState().go('drill')
  }

  const handleTcDrill = () => {
    useGame.getState().startTcDrillSession()
    useUi.getState().go('tcdrill')
  }

  const handleCharts = () => useUi.getState().go('charts')

  const handleSettings = () => useUi.getState().go('settings')

  const countVisibility =
    showRunningCount && showTrueCount
      ? 'RC + TC'
      : showRunningCount
        ? 'RC'
        : showTrueCount
          ? 'TC'
          : 'hidden'

  const summary: string[] = [
    `${decks}D`,
    ruleset,
    surrenderEnabled ? 'Surrender' : 'No surrender',
    `Count: ${countVisibility}`,
  ]

  return (
    <div
      style={{
        // Fill #root (which already equals the viewport minus the safe-area
        // insets applied as body padding) instead of 100dvh, which would
        // double-count the insets and make this static screen scrollable.
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        padding: '32px 20px',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      {/* Auto margins on the first/last children center the content when it
          fits, but fall back to top-aligned scrollable layout when it does
          not (e.g. landscape iPhones), unlike justify-content: center which
          clips the top overflow. */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(2rem, 9vw, 3rem)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
          }}
        >
          Blackjack
          <br />
          Trainer
        </h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '0.95rem' }}>
          Practice basic strategy, counting &amp; deviations
        </p>
      </header>

      <div
        style={{
          width: '100%',
          maxWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <button type="button" onClick={handlePlay} style={primaryButton('#15803d')}>
          Play
        </button>
        <button type="button" onClick={handleDrill} style={primaryButton('#1d4ed8')}>
          Deviation Drill
        </button>
        <button type="button" onClick={handleTcDrill} style={primaryButton('#0e7490')}>
          TC Drill
        </button>
        <button type="button" onClick={handleCharts} style={primaryButton('#6d28d9')}>
          Charts
        </button>
        <button type="button" onClick={handleSettings} style={secondaryButton}>
          Settings
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
          maxWidth: 360,
          marginBottom: 'auto',
        }}
      >
        {summary.map((chip) => (
          <span
            key={chip}
            style={{
              fontSize: '0.8rem',
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(148, 163, 184, 0.18)',
              color: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  )
}

function primaryButton(bg: string): React.CSSProperties {
  return {
    width: '100%',
    padding: '16px 20px',
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#fff',
    background: bg,
    border: 'none',
    borderRadius: 14,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
    touchAction: 'manipulation',
  }
}

const secondaryButton: React.CSSProperties = {
  width: '100%',
  padding: '14px 20px',
  fontSize: '1.05rem',
  fontWeight: 600,
  color: 'inherit',
  background: 'transparent',
  border: '1.5px solid rgba(148, 163, 184, 0.5)',
  borderRadius: 14,
  cursor: 'pointer',
  touchAction: 'manipulation',
}
