import { LogoMark } from '../components/Logo'

export function Processing() {
  return (
    <div className="ff-fade flex h-full flex-col items-center justify-center gap-5 bg-paper" data-testid="processing">
      <div className="animate-pulse">
        <LogoMark size={44} />
      </div>
      <div className="text-center">
        <p className="font-display text-[32px] leading-none">Composing your demo</p>
        <p className="mt-2.5 text-[13.5px] text-ink-2">Finding your Moments, setting up the camera and applying your style…</p>
      </div>
    </div>
  )
}
