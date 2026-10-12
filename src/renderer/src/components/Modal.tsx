import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './ui'

export function Modal({ open, onClose, title, children, width = 460, dismissable = true }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number; dismissable?: boolean }) {
  useEffect(() => {
    if (!open || !dismissable) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissable])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="ff-fade-in max-h-[90vh] overflow-y-auto rounded-2xl bg-panel shadow-2xl ring-1 ring-line-strong" style={{ width }}>
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {dismissable && (
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          )}
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}
