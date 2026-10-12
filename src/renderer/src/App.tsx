import { useEffect } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useApp } from './state/appStore'
import { useEditor } from './state/editorStore'
import { useStudio } from './state/studioStore'
import { useAutosave } from './lib/autosave'
import { projectFromRecording } from './lib/projectFlow'
import { errorMessage } from './lib/format'
import { Home } from './screens/Home'
import { RecordSetup } from './screens/RecordSetup'
import { Processing } from './screens/Processing'
import { Studio } from './screens/Studio'
import { SettingsDialog } from './components/SettingsDialog'
import { ExportDialog } from './components/ExportDialog'

function useCaptureLifecycle(): void {
  useEffect(() => {
    return window.frameflow.capture.onEvent((event) => {
      const app = useApp.getState()
      if (event.type === 'stopped') {
        app.navigate({ name: 'processing' })
        projectFromRecording(event.result, app.prefs)
          .then(() => {
            useStudio.getState().reset('moments')
            useApp.getState().navigate({ name: 'studio' })
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
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-[460px] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={clsx(
            'ff-rise pointer-events-auto flex items-start gap-3 rounded-[14px] px-4 py-3 text-[13px] shadow-[var(--shadow-lift)]',
            t.kind === 'error' ? 'bg-coral-soft text-[#7a3a2c]' : 'bg-ink text-paper',
          )}
        >
          <span className="flex-1 leading-snug">{t.message}</span>
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">
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
      screen = <RecordSetup />
      break
    case 'processing':
      screen = <Processing />
      break
    case 'studio':
      screen = hasProject ? <Studio /> : <Home />
      break
  }
  return (
    <div className="flex h-full flex-col">
      <div key={route.name} className="ff-fade flex min-h-0 flex-1 flex-col">
        {screen}
      </div>
      <SettingsDialog />
      <ExportDialog />
      <Toasts />
    </div>
  )
}
