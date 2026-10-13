import { AudioLines, Clapperboard, Focus, LayoutPanelTop, MousePointer2, Palette } from 'lucide-react'
import { clsx } from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import { useStudio, type StudioSection } from '../../state/studioStore'
import { useEditor } from '../../state/editorStore'

const ITEMS: Array<{ id: StudioSection; label: string; icon: typeof Palette }> = [
  { id: 'moments', label: 'Moments', icon: LayoutPanelTop },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'camera', label: 'Camera', icon: Focus },
  { id: 'cursor', label: 'Cursor', icon: MousePointer2 },
  { id: 'sound', label: 'Sound', icon: AudioLines },
  { id: 'timeline', label: 'Timeline', icon: Clapperboard },
]

/** Section switcher. Purely navigational: the project and playhead are untouched. */
export function Dock() {
  const section = useStudio((s) => s.section)
  const open = useStudio((s) => s.open)
  const setMode = useEditor((s) => s.setMode)
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="true"]')
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [section])
  return (
    <nav ref={ref} aria-label="Studio sections" className="relative flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-[var(--shadow-soft)] ring-1 ring-line/60">
      {pill && <span aria-hidden className="absolute bottom-1 top-1 rounded-full bg-ink transition-[left,width] duration-200 ease-[var(--ease-out-soft)]" style={{ left: pill.left, width: pill.width }} />}
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          data-testid={`dock-${id}`}
          aria-current={section === id}
          onClick={() => {
            open(id)
            setMode(id === 'timeline' ? 'advanced' : 'quick')
          }}
          className={clsx('relative z-10 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors', section === id ? 'text-paper' : 'text-ink-2 hover:text-ink')}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </nav>
  )
}
