import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { Button, IconButton } from './ui'

/** A modal sheet that rises over a softly dimmed paper backdrop. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 480,
  dismissable = true,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: number
  dismissable?: boolean
  className?: string
}) {
  useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissable])
  if (!open) return null
  return (
    <div
      className="ff-fade fixed inset-0 z-40 flex items-center justify-center bg-[rgba(37,38,43,0.22)] p-6 backdrop-blur-[3px]"
      onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx('ff-rise max-h-[92vh] overflow-y-auto rounded-[var(--radius-sheet)] bg-surface shadow-[0_30px_80px_-20px_rgba(37,38,43,0.35)]', className)}
        style={{ width }}
      >
        <div className="flex items-start justify-between px-7 pb-1 pt-6">
          <div>
            <h2 className="font-display text-[28px] leading-none text-ink">{title}</h2>
            {subtitle && <p className="mt-2 text-[13px] text-ink-2">{subtitle}</p>}
          </div>
          {dismissable && (
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
              <X size={17} />
            </IconButton>
          )}
        </div>
        <div className="px-7 pb-7 pt-4">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title} width={420}>
      <p className="text-[13px] leading-relaxed text-ink-2">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'secondary' : 'primary'} className={danger ? 'text-coral-ink' : undefined} onClick={onConfirm} data-testid="confirm-action">
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}
