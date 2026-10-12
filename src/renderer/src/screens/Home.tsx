import { useEffect, useState } from 'react'
import { ArrowRight, Clapperboard, FolderOpen, Import, Settings, Sparkles, X } from 'lucide-react'
import type { RecentProject } from '@shared/project'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { openProjectAt, projectFromImport } from '../lib/projectFlow'
import { errorMessage, formatDate, formatTime } from '../lib/format'
import { Wordmark } from '../components/Logo'
import { Button, IconButton, Spinner } from '../components/ui'

function openEditorFor(): void {
  const project = useEditor.getState().project
  useApp.getState().navigate(project?.mode === 'advanced' ? { name: 'editor' } : { name: 'quick' })
}

export function Home() {
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const prefs = useApp((s) => s.prefs)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)
  const [recents, setRecents] = useState<RecentProject[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    useEditor.getState().close()
    window.frameflow.project.recent().then(setRecents, () => setRecents([]))
  }, [])

  const run = async (label: string, fn: () => Promise<boolean | void>) => {
    setBusy(label)
    try {
      const opened = await fn()
      if (opened !== false) openEditorFor()
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b border-line pl-24 pr-4">
        <Wordmark />
        <div className="no-drag flex items-center gap-1">
          <Button variant="ghost" onClick={() => run('open', async () => {
            const opened = await window.frameflow.project.chooseAndOpen()
            if (!opened) return false
            useEditor.getState().load(opened)
          })}>
            <FolderOpen size={15} /> Open Project…
          </Button>
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} />
          </IconButton>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-12">
          <h1 className="text-[28px] font-semibold tracking-tight">Make a demo people want to watch.</h1>
          <p className="mt-2 text-[15px] text-muted">Record your screen. FrameFlow adds the zooms, the smooth cursor and the polish.</p>

          <div className="mt-8 grid grid-cols-5 gap-4">
            <button
              data-testid="start-quick-demo"
              onClick={() => navigate({ name: 'record', intent: 'quick' })}
              className="group relative col-span-3 overflow-hidden rounded-2xl p-[1px] text-left transition-transform hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, rgba(154,163,255,0.9), rgba(91,91,240,0.5) 45%, rgba(255,255,255,0.08))' }}
            >
              <div className="relative flex h-full min-h-[208px] flex-col rounded-[15px] bg-[radial-gradient(120%_120%_at_0%_0%,#262a5c_0%,#14151c_55%)] p-6">
                <span className="inline-flex self-start items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                  <Sparkles size={12} /> Recommended
                </span>
                <h2 className="mt-5 text-xl font-semibold">Quick Demo</h2>
                <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-[#c5c8d6]">Record your screen. Get a beautiful video automatically.</p>
                <div className="mt-auto flex items-center gap-2 pt-8 text-[13px] font-medium text-white">
                  Start recording <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </button>

            <button
              data-testid="start-advanced"
              onClick={() => navigate({ name: 'record', intent: 'advanced' })}
              className="group col-span-2 flex min-h-[210px] flex-col rounded-2xl bg-panel p-6 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-strong"
            >
              <span className="inline-flex h-[26px] w-[26px] self-start items-center justify-center rounded-lg bg-white/5 text-muted">
                <Clapperboard size={14} />
              </span>
              <h2 className="mt-5 text-xl font-semibold">Advanced Editor</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">Create and customize your demo with full control.</p>
              <div className="mt-auto flex items-center gap-2 pt-8 text-[13px] font-medium text-fg">
                Record <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          </div>

          <div className="mt-4 flex gap-3">
            <Button data-testid="import-video" disabled={!!busy} onClick={() => run('import', () => projectFromImport(prefs))}>
              {busy === 'import' ? <Spinner size={14} /> : <Import size={15} />} Import Existing Video
            </Button>
          </div>

          <div className="mt-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Recent Projects</h2>
            </div>
            {recents === null ? (
              <div className="py-10 text-center text-muted"><Spinner /></div>
            ) : recents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
                <p className="text-[14px] text-fg">No projects yet</p>
                <p className="mt-1 text-[13px] text-muted">Your recordings and edits will appear here, saved automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4" data-testid="recent-projects">
                {recents.map((r) => (
                  <div key={r.path} className="group relative">
                    <button
                      onClick={() => run(`open:${r.path}`, () => openProjectAt(r.path))}
                      className="block w-full overflow-hidden rounded-xl bg-panel text-left ring-1 ring-line transition hover:ring-line-strong"
                    >
                      <div className="flex aspect-video items-center justify-center bg-panel-2">
                        {r.thumbnail ? <img src={r.thumbnail} alt="" className="h-full w-full object-cover" /> : <Clapperboard size={22} className="text-subtle" />}
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="truncate text-[13px] font-medium">{r.name}</div>
                        <div className="mt-0.5 text-[11px] text-subtle">
                          {formatDate(r.updatedAt)} · {formatTime(r.duration)}
                        </div>
                      </div>
                    </button>
                    {busy === `open:${r.path}` && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50"><Spinner /></div>
                    )}
                    <IconButton
                      label="Remove from recents"
                      className="absolute right-2 top-2 bg-black/50 opacity-0 backdrop-blur group-hover:opacity-100"
                      onClick={async () => {
                        await window.frameflow.project.forget(r.path)
                        setRecents((list) => list?.filter((x) => x.path !== r.path) ?? null)
                      }}
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
