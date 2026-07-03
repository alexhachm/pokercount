import type { Action } from '@/types'

export interface ActionBarProps {
  legal: Action[]
  onAction: (a: Action) => void
  disabled?: boolean
}

/** Display order + per-action styling. Only actions present in `legal` render. */
const ACTION_ORDER: Action[] = ['surrender', 'split', 'double', 'hit', 'stand']

const ACTION_META: Record<Action, { label: string; classes: string }> = {
  surrender: { label: 'Surrender', classes: 'bg-gray-500 hover:bg-gray-400 active:bg-gray-600' },
  split: { label: 'Split', classes: 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700' },
  double: { label: 'Double', classes: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600' },
  hit: { label: 'Hit', classes: 'bg-green-600 hover:bg-green-500 active:bg-green-700' },
  stand: { label: 'Stand', classes: 'bg-red-600 hover:bg-red-500 active:bg-red-700' },
}

export default function ActionBar({ legal, onAction, disabled = false }: ActionBarProps) {
  const actions = ACTION_ORDER.filter((a) => legal.includes(a))
  if (actions.length === 0) return null

  // Narrow iPhones (375px) can't fit five equal-width buttons: shrink labels at
  // 4+ actions and wrap Surrender onto its own row (below the main actions)
  // when all five are legal. Wider screens keep the single five-across row.
  const sizeClasses = actions.length >= 4 ? 'px-1 text-sm' : 'px-2 text-base'

  return (
    <div className="flex w-full flex-wrap gap-2">
      {actions.map((action) => {
        const meta = ACTION_META[action]
        const basisFull =
          actions.length === 5 && action === 'surrender'
            ? 'max-[479px]:order-last max-[479px]:basis-full'
            : ''
        return (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action)}
            className={`min-w-0 flex-1 touch-manipulation select-none rounded-xl py-4 font-bold uppercase tracking-wide text-white shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sizeClasses} ${basisFull} ${meta.classes}`}
          >
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
