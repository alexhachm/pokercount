import { useGame } from '@/store/gameStore'
import { useUi } from '@/store/uiStore'
import PlayingCard from '@/components/PlayingCard'
import type { MistakeRecord } from '@/types'

export default function SummaryScreen() {
  const mistakes = useGame((s) => s.mistakes)
  const decisionsCount = useGame((s) => s.decisionsCount)
  const resetSession = useGame((s) => s.resetSession)
  const go = useUi((s) => s.go)

  const mistakeCount = mistakes.length
  const correctCount = Math.max(decisionsCount - mistakeCount, 0)
  // Accuracy over all decisions; guard against divide-by-zero on an empty session.
  const accuracy = decisionsCount > 0 ? Math.round((correctCount / decisionsCount) * 100) : 100

  const handleHome = () => {
    resetSession()
    go('home')
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: 520,
        margin: '0 auto',
        padding: '16px 16px 0',
        boxSizing: 'border-box',
        color: '#f4f4f5',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 12px' }}>Session Summary</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Stat label="Decisions" value={String(decisionsCount)} />
        <Stat label="Mistakes" value={String(mistakeCount)} accent={mistakeCount > 0 ? '#f87171' : undefined} />
        <Stat label="Accuracy" value={`${accuracy}%`} accent={accuracy >= 90 ? '#4ade80' : '#fbbf24'} />
      </div>

      {mistakeCount === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 8,
            paddingBottom: 24,
          }}
        >
          <div style={{ fontSize: 48 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Flawless!</div>
          <div style={{ color: '#a1a1aa', maxWidth: 280 }}>
            {decisionsCount > 0
              ? 'No mistakes this session. Perfect play.'
              : 'No decisions recorded yet.'}
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingBottom: 16,
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {mistakes.map((m) => (
            <MistakeRow key={m.id} record={m} />
          ))}
        </div>
      )}

      <div
        style={{
          padding: '12px 0 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <button
          onClick={handleHome}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: 17,
            fontWeight: 700,
            color: '#0b0b0c',
            background: '#fbbf24',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          Home
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '10px 8px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: accent ?? '#f4f4f5',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  )
}

function MistakeRow({ record }: { record: MistakeRecord }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {record.playerCards.map((c) => (
            <PlayingCard key={c.id} card={c} size="sm" />
          ))}
        </div>
        <span style={{ color: '#a1a1aa', fontSize: 13 }}>vs</span>
        <PlayingCard card={record.dealerUpcard} size="sm" />
        {/* TC-drill spots have no live count — the TC is the answer itself. */}
        {record.mode !== 'tcdrill' && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
              color: '#a1a1aa',
            }}
          >
            TC {record.trueCount.toFixed(1)}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, color: '#f87171', fontWeight: 600 }}>
          You: {labelAction(record.chosen)}
        </span>
        <span style={{ fontSize: 14, color: '#4ade80', fontWeight: 600 }}>
          Correct: {labelAction(record.correct)}
        </span>
        {record.isDeviation && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: '#0b0b0c',
              background: '#fbbf24',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            DEVIATION
          </span>
        )}
      </div>

      {record.reason && (
        <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.35 }}>{record.reason}</div>
      )}
    </div>
  )
}

function labelAction(a: string): string {
  return a.charAt(0).toUpperCase() + a.slice(1)
}
