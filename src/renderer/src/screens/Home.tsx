import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Ellipsis, FileWarning, FolderOpen, Pencil, Plus, Settings, X } from 'lucide-react'
import type { RecentProject } from '@shared/project'
import { useApp } from '../state/appStore'
import { useEditor } from '../state/editorStore'
import { useStudio } from '../state/studioStore'
import { openProjectAt, projectFromImport } from '../lib/projectFlow'
import { errorMessage, formatDate, formatTime } from '../lib/format'
import { Wordmark } from '../components/Logo'
import { Badge, Button, EmptyState, IconButton, Menu, Spinner } from '../components/ui'

function enterStudio(): void {
  const project = useEditor.getState().project
  useStudio.getState().reset(project?.mode === 'advanced' ? 'timeline' : 'moments')
  useApp.getState().navigate({ name: 'studio' })
}

/* Original illustrations, drawn in the brand palette. */
function RecordArt() {
  return (
    <svg viewBox="0 0 220 150" className="h-full w-full" aria-hidden>
      <rect x="18" y="16" width="184" height="118" rx="14" fill="#fff" stroke="#DFDED8" />
      <rect x="18" y="16" width="184" height="20" rx="14" fill="#EFEEE9" />
      <circle cx="32" cy="26" r="3" fill="#E7A99A" />
      <circle cx="42" cy="26" r="3" fill="#DFDED8" />
      <circle cx="52" cy="26" r="3" fill="#DFDED8" />
      <rect x="34" y="50" width="62" height="8" rx="4" fill="#EFEEE9" />
      <rect x="34" y="66" width="44" height="8" rx="4" fill="#EFEEE9" />
      <rect x="112" y="50" width="74" height="54" rx="8" fill="#ECE7F6" />
      <path d="M44 112 C 80 112, 92 78, 138 78" fill="none" stroke="#AA9ACF" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" />
      <circle cx="148" cy="78" r="15" fill="none" stroke="#AA9ACF" strokeWidth="1.5" opacity="0.6" />
      <path d="M146 74 l0 15 l4 -4 l3 6 l3 -1.4 l-3 -6 l5.5 0 z" fill="#25262B" />
    </svg>
  )
}

function ImportArt() {
  return (
    <svg viewBox="0 0 220 150" className="h-full w-full" aria-hidden>
      <rect x="46" y="22" width="150" height="96" rx="12" fill="#fff" stroke="#DFDED8" transform="rotate(5 121 70)" />
      <rect x="32" y="30" width="150" height="96" rx="12" fill="#fff" stroke="#DFDED8" />
      <rect x="44" y="42" width="126" height="72" rx="7" fill="#EFEEE9" />
      <path d="M96 66 l22 12 l-22 12 z" fill="#25262B" />
      <circle cx="178" cy="114" r="16" fill="#E7A99A" />
      <path d="M178 106 v14 m-6 -6 l6 6 l6 -6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EmptyArt() {
  return (
    <svg viewBox="0 0 160 100" width="200" height="125" aria-hidden>
      <rect x="10" y="12" width="140" height="80" rx="12" fill="#fff" stroke="#DFDED8" />
      <path d="M30 72 C 60 72, 68 40, 104 40" fill="none" stroke="#AA9ACF" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="112" cy="40" r="6" fill="#E7A99A" />
    </svg>
  )
}

function ProjectCard({ project, busy, onOpen, onChanged }: { project: RecentProject; busy: boolean; onOpen: () => void; onChanged: () => void }) {
  const toast = useApp((s) => s.toast)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(project.name)
  const portrait = project.aspectRatio === '9:16'

  const commitRename = async () => {
    setRenaming(false)
    const next = name.trim()
    if (!next || next === project.name) return setName(project.name)
    try {
      await window.frameflow.project.rename(project.path, next)
      onChanged()
    } catch (err) {
      setName(project.name)
      toast('error', errorMessage(err))
    }
  }

  return (
    <article className="ff-lift group relative overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-soft)]" data-testid="project-card">
      <button onClick={onOpen} className="block w-full text-left" aria-label={`Open ${project.name}`}>
        <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-sunk">
          {project.thumbnail ? (
            <img src={project.thumbnail} alt="" className={portrait ? 'h-full w-auto object-contain' : 'h-full w-full object-cover'} loading="lazy" decoding="async" />
          ) : (
            <span className="font-display text-[34px] italic text-ink-3">{project.name.slice(0, 1)}</span>
          )}
          <div className="absolute bottom-2.5 left-2.5 flex gap-1.5">
            {project.aspectRatio && <Badge className="bg-surface/90 backdrop-blur">{project.aspectRatio}</Badge>}
            {project.mediaMissing && (
              <Badge tone="coral" className="bg-coral-soft/95">
                <FileWarning size={11} /> Video missing
              </Badge>
            )}
          </div>
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-paper/60">
              <Spinner />
            </div>
          )}
        </div>
      </button>
      <div className="px-4 pb-3.5 pt-3">
        {renaming ? (
          <input
            autoFocus
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setName(project.name)
                setRenaming(false)
              }
            }}
            className="font-display -mx-1 w-[calc(100%+8px)] rounded-md bg-paper px-1 text-[21px] leading-[26px] text-ink outline-none ring-2 ring-lavender"
          />
        ) : (
          <button onClick={onOpen} className="font-display block w-full truncate text-left text-[21px] leading-[26px] text-ink">
            {project.name}
          </button>
        )}
        <div className="mt-0.5 text-[12px] text-ink-2">
          {formatTime(project.duration)} · {formatDate(project.updatedAt)}
        </div>
      </div>
      <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Menu
          label={`${project.name} actions`}
          trigger={(t) => (
            <button {...t} aria-label="Project actions" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface/95 text-ink shadow-[var(--shadow-soft)] backdrop-blur hover:bg-surface">
              <Ellipsis size={16} />
            </button>
          )}
          items={[
            { label: 'Rename', icon: <Pencil size={14} />, onSelect: () => setRenaming(true) },
            { label: 'Show in Finder', icon: <FolderOpen size={14} />, onSelect: () => void window.frameflow.project.reveal(project.path).catch((e) => toast('error', errorMessage(e))) },
            {
              label: 'Remove from Recents',
              icon: <X size={14} />,
              onSelect: async () => {
                await window.frameflow.project.forget(project.path)
                onChanged()
                toast('info', `“${project.name}” was removed from Recents. Its files were not deleted.`)
              },
            },
          ]}
        />
      </div>
    </article>
  )
}

export function Home() {
  const navigate = useApp((s) => s.navigate)
  const toast = useApp((s) => s.toast)
  const prefs = useApp((s) => s.prefs)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)
  const [recents, setRecents] = useState<RecentProject[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(() => {
    window.frameflow.project.recent().then(setRecents, () => setRecents([]))
  }, [])

  useEffect(() => {
    useEditor.getState().close()
    refresh()
  }, [refresh])

  const run = async (label: string, fn: () => Promise<boolean | void>) => {
    setBusy(label)
    try {
      const opened = await fn()
      if (opened !== false) enterStudio()
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const openFile = () =>
    run('open', async () => {
      const opened = await window.frameflow.project.chooseAndOpen()
      if (!opened) return false
      useEditor.getState().load(opened)
    })

  return (
    <div className="flex h-full flex-col bg-paper" data-testid="home">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between pl-24 pr-5">
        <Wordmark size={21} />
        <div className="no-drag flex items-center gap-1.5">
          <Button variant="ghost" onClick={openFile} data-testid="open-project-file">
            <FolderOpen size={15} /> Open…
          </Button>
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} />
          </IconButton>
          <Button variant="primary" onClick={() => navigate({ name: 'record' })} data-testid="new-project">
            <Plus size={15} /> New project
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1160px] px-12 pb-20 pt-10">
          <section className="ff-rise">
            <h1 className="font-display text-[56px] leading-[1.02] tracking-[-0.02em] text-ink">
              Make something <em className="italic text-lavender-ink">worth</em> showing.
            </h1>
            <p className="mt-3 text-[16px] text-ink-2">Turn screen recordings into beautiful demos.</p>
          </section>

          <section className="mt-10 grid grid-cols-2 gap-5" aria-label="Create">
            <button
              data-testid="record-demo"
              onClick={() => navigate({ name: 'record' })}
              className="ff-lift group flex h-[230px] overflow-hidden rounded-[var(--radius-sheet)] bg-surface text-left shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-1 flex-col p-7">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-coral" aria-hidden />
                <h2 className="font-display mt-4 text-[34px] leading-none">Record a Demo</h2>
                <p className="mt-2.5 max-w-[240px] text-[13.5px] leading-relaxed text-ink-2">Capture your screen and get a styled video with camera moves, automatically.</p>
                <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  Start recording <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>
              <div className="w-[46%] bg-[radial-gradient(120%_120%_at_100%_0%,#ECE7F6_0%,#F7F5F0_60%)] p-4">
                <RecordArt />
              </div>
            </button>
            <button
              data-testid="import-video"
              disabled={!!busy}
              onClick={() => run('import', () => projectFromImport(prefs))}
              className="ff-lift group flex h-[230px] overflow-hidden rounded-[var(--radius-sheet)] bg-surface text-left shadow-[var(--shadow-soft)] disabled:opacity-60"
            >
              <div className="flex flex-1 flex-col p-7">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-lavender" aria-hidden />
                <h2 className="font-display mt-4 text-[34px] leading-none">Import a Video</h2>
                <p className="mt-2.5 max-w-[240px] text-[13.5px] leading-relaxed text-ink-2">Bring existing footage into the studio and frame it beautifully.</p>
                <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  {busy === 'import' ? <Spinner size={14} /> : null} Choose a file <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </div>
              <div className="w-[46%] bg-[radial-gradient(120%_120%_at_100%_100%,#F8E6E1_0%,#F7F5F0_60%)] p-4">
                <ImportArt />
              </div>
            </button>
          </section>

          <section className="mt-14" aria-label="Recent projects">
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="font-display text-[30px] leading-none">Recent projects</h2>
              {recents && recents.length > 0 && <span className="text-[12px] text-ink-2">{recents.length} {recents.length === 1 ? 'project' : 'projects'}</span>}
            </div>
            {recents === null ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ff-shimmer aspect-[16/12] rounded-[var(--radius-card)]" />
                ))}
              </div>
            ) : recents.length === 0 ? (
              <EmptyState
                art={<EmptyArt />}
                title="Your studio is empty"
                body="Record a demo or import a video. Projects are saved here automatically, and stay on this Mac."
                action={
                  <Button variant="primary" onClick={() => navigate({ name: 'record' })}>
                    Record your first demo
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6" data-testid="recent-projects">
                {recents.map((r) => (
                  <ProjectCard key={r.path} project={r} busy={busy === `open:${r.path}`} onOpen={() => run(`open:${r.path}`, () => openProjectAt(r.path))} onChanged={refresh} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
