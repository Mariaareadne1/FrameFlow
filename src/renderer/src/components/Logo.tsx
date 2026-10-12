export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="ff-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9aa3ff" />
          <stop offset="1" stopColor="#5b5bf0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#ff-logo)" />
      <rect x="7" y="9" width="18" height="13" rx="3" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" />
      <rect x="11.5" y="12.2" width="9" height="6.6" rx="1.6" fill="white" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">FrameFlow</span>
    </div>
  )
}
