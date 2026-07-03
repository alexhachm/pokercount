import type { StrategyDecision } from '@/types'

export interface HintBannerProps {
  hint: StrategyDecision | null
  canShow: boolean
  revealed: boolean
  onShow: () => void
}

export default function HintBanner({ hint, canShow, revealed, onShow }: HintBannerProps) {
  if (canShow && !revealed) {
    return (
      <button
        type="button"
        onClick={onShow}
        className="w-full select-none rounded-xl border border-dashed border-slate-500 bg-slate-800/60 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-200 transition-colors hover:bg-slate-700"
      >
        Show correct move
      </button>
    )
  }

  if (revealed && hint) {
    return (
      <div className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-extrabold uppercase tracking-wide">
            {hint.action}
          </span>
          {hint.isDeviation && (
            <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900">
              Deviation
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-300">{hint.reason}</p>
      </div>
    )
  }

  return null
}
