/**
 * FrameFlow mark: a composition frame with a motion path gliding to a focus point.
 * Original artwork; ink on paper with a lavender path and a coral point.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2.5" y="5.5" width="27" height="21" rx="6" fill="none" stroke="#25262B" strokeWidth="2" />
      <path d="M7.5 21.5 C 12 21.5, 13 12, 19.5 12" fill="none" stroke="#AA9ACF" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="22.5" cy="12" r="2.6" fill="#E7A99A" />
    </svg>
  )
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size + 4} />
      <span className="font-display leading-none text-ink" style={{ fontSize: size }}>
        Frame<em className="italic">flow</em>
      </span>
    </div>
  )
}
