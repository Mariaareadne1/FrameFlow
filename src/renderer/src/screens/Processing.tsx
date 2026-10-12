import { Spinner } from '../components/ui'

export function Processing() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4" data-testid="processing">
      <Spinner size={28} />
      <div className="text-center">
        <p className="text-[15px] font-medium">Creating your demo</p>
        <p className="mt-1 text-[13px] text-muted">Analyzing cursor movement, placing zooms and applying your style…</p>
      </div>
    </div>
  )
}
