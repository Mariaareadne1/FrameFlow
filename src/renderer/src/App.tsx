import { useEffect } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useApp } from './state/appStore'
import { useEditor } from './state/editorStore'
import { useAutosave } from './lib/autosave'
import { projectFromRecording } from './lib/projectFlow'
import { errorMessage } from './lib/format'
import { Home } from './screens/Home'
import { RecordSetup } from './screens/RecordSetup'
import { Processing } from './screens/Processing'
import { QuickDemo } from './screens/QuickDemo'
import { Editor } from './screens/Editor'
import { SettingsDialog } from './components/SettingsDialog'
import { ExportDialog } from './components/ExportDialog'

function useCaptureLifecycle(): void {
  useEffect(() => {
    return window.frameflow.capture.onEvent((event) => {
      const app = useApp.getState()
      if (event.type === 'stopped') {
        const intent = app.route.name === 'record' || app.route.name === 'processing' ? app.route.intent : 'quick'
        app.navigate({ name: 'processing', intent })
        projectFromRecording(event.result, app.prefs)
          .then(() => {
            useEditor.getState().setMode(intent === 'quick' ? 'quick' : 'advanced')
            useApp.getState().navigate(intent === 'quick' ? { name: 'quick' } : { name: 'editor' })
          })
          .catch((err) => {
            useApp.getState().toast('error', `The recording was saved but could not be opened: ${errorMessage(err)}`)
            useApp.getState().navigate({ name: 'home' })
          })
      } else if (event.type === 'error') {
        app.toast('error', event.message)
      }
    })
  }, [])
}

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-[440px] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={clsx(
            'ff-fade-in pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-[13px] shadow-2xl ring-1 backdrop-blur-xl',
            t.kind === 'error' ? 'bg-[#2a1416]/95 text-[#ffd5d5] ring-danger/30' : 'bg-panel-3/95 text-fg ring-line-strong',
          )}
        >
          <span className="flex-1 leading-snug">{t.message}</span>
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function App() {
  const route = useApp((s) => s.route)
  const hasProject = useEditor((s) => !!s.project)
  useCaptureLifecycle()
  useAutosave()

  let screen
  switch (route.name) {
    case 'home':
      screen = <Home />
      break
    case 'record':
      screen = <RecordSetup intent={route.intent} />
      break
    case 'processing':
      screen = <Processing />
      break
    case 'quick':
      screen = hasProject ? <QuickDemo /> : <Home />
      break
    case 'editor':
      screen = hasProject ? <Editor /> : <Home />
      break
  }
  return (
    <div className="flex h-full flex-col">
      {screen}
      <SettingsDialog />
      <ExportDialog />
      <Toasts />
    </div>
  )
}
