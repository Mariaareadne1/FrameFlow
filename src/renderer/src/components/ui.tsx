import { clsx } from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

/* ------------------------------------------------------------------------------------- */
/* Buttons                                                                                */
/* ------------------------------------------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'h-7 px-2.5 text-[12px]',
        size === 'md' && 'h-9 px-3.5 text-[13px]',
        size === 'lg' && 'h-11 px-5 text-[14px]',
        variant === 'primary' && 'bg-ink text-paper shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:bg-[#34353b]',
        variant === 'secondary' && 'bg-surface text-ink shadow-[var(--shadow-soft)] ring-1 ring-line/70 hover:ring-line',
        variant === 'ghost' && 'text-ink-2 hover:bg-sunk hover:text-ink',
        variant === 'accent' && 'bg-lavender-soft text-lavender-ink hover:bg-[#e3dbf2]',
        variant === 'danger' && 'text-coral-ink hover:bg-coral-soft',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <Tooltip text={label}>
      <button
        {...rest}
        aria-label={label}
        className={clsx(
          'inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-ink-2 transition-colors hover:bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-30',
          active && 'bg-sunk text-ink',
          className,
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Tooltip — appears after a short delay, never steals focus                              */
/* ------------------------------------------------------------------------------------- */

export function Tooltip({ text, children, side = 'bottom' }: { text: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const show = () => {
    timer.current = window.setTimeout(() => setOpen(true), 450)
  }
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current)
    setOpen(false)
  }
  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide}>
      {children}
      {open && (
        <span
          role="tooltip"
          className={clsx(
            'ff-fade pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper shadow-lg',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
          )}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Segmented control with a gliding selection indicator                                   */
/* ------------------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  size = 'md',
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string; disabled?: boolean }>
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    else setPill(null)
  }, [value, options.length])
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={clsx('relative flex rounded-[12px] bg-sunk p-[3px]', className)}>
      {pill && (
        <span
          aria-hidden
          className="absolute bottom-[3px] top-[3px] rounded-[9px] bg-surface shadow-[0_1px_3px_rgba(37,38,43,0.12)] transition-[left,width] duration-200 ease-[var(--ease-out-soft)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2.5 font-medium transition-colors disabled:opacity-35',
            size === 'md' ? 'h-8 text-[12.5px]' : 'h-7 text-[12px]',
            value === o.value ? 'text-ink' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Inputs                                                                                 */
/* ------------------------------------------------------------------------------------- */

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  hint,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
  disabled?: boolean
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <label className={clsx('block', disabled && 'opacity-50')}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[12.5px] text-ink">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-ink-2">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="ff-range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{hint}</span>}
    </label>
  )
}

export function Toggle({ label, checked, onChange, description, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string; disabled?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 py-0.5', disabled && 'opacity-50')}>
      <span>
        <span className="block text-[12.5px] text-ink">{label}</span>
        {description && <span className="block text-[11.5px] leading-snug text-ink-2">{description}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-ink' : 'bg-sunk-2')}
      >
        <span className={clsx('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[var(--ease-out-soft)]', checked ? 'left-[19px]' : 'left-[3px]')} />
      </button>
    </div>
  )
}

/** An inspector group: a quiet small-caps title and spaced controls, no boxes. */
export function Section({ title, children, action, description }: { title: string; children: ReactNode; action?: ReactNode; description?: string }) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2">{title}</h3>
          {description && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx('inline-block animate-spin rounded-full border-2 border-ink/15 border-t-ink/70', className)}
      style={{ width: size, height: size }}
    />
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] bg-sunk px-1.5 py-px font-mono text-[10px] text-ink-2">{children}</kbd>
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'lavender' | 'coral' | 'sage'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium',
        tone === 'neutral' && 'bg-sunk text-ink-2',
        tone === 'lavender' && 'bg-lavender-soft text-lavender-ink',
        tone === 'coral' && 'bg-coral-soft text-coral-ink',
        tone === 'sage' && 'bg-sage-soft text-[#3f6b4c]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={clsx('h-1.5 overflow-hidden rounded-full bg-sunk', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full bg-ink transition-[width] duration-200 ease-out" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function EmptyState({ title, body, action, art }: { title: string; body: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-surface/60 px-8 py-14 text-center">
      {art}
      <h3 className="font-display mt-5 text-[26px] leading-tight text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------------------------- */
/* Menu (popover with click-outside and Escape)                                           */
/* ------------------------------------------------------------------------------------- */

export interface MenuItem {
  label: string
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
}

export function Menu({ trigger, items, align = 'right', label }: { trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode; items: MenuItem[]; align?: 'left' | 'right'; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && (
        <div role="menu" aria-label={label} className={clsx('ff-rise absolute top-full z-40 mt-1 min-w-[180px] rounded-[12px] bg-surface p-1 shadow-[var(--shadow-lift)] ring-1 ring-line/60', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                it.onSelect()
              }}
              className={clsx('flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] hover:bg-sunk', it.danger ? 'text-coral-ink' : 'text-ink')}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
