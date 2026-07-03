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

  return (
    <div className="flex w-full gap-2">
      {actions.map((action) => {
        const meta = ACTION_META[action]
        return (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action)}
            className={`flex-1 select-none rounded-xl px-2 py-4 text-base font-bold uppercase tracking-wide text-white shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${meta.classes}`}
          >
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
