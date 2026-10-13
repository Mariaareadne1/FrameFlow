import { useState } from 'react'
import { AudioLines, Mic, Plus, Trash2, Volume2, X } from 'lucide-react'
import type { Project } from '@shared/project'
import { addSoundTrack, removeSoundTrack, setMainGain, updateSoundTrack } from '@shared/projectModel'
import { useApp } from '../../state/appStore'
import { useEditor } from '../../state/editorStore'
import { useStudio } from '../../state/studioStore'
import { openInput } from '../../media/source'
import { errorMessage } from '../../lib/format'
import { Button, IconButton, Section, Slider } from '../ui'

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Checks an audio file is decodable before it joins the mix. */
async function assertPlayableAudio(path: string): Promise<void> {
  const { input, close } = await openInput(path)
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) throw new Error('That file has no audio FrameFlow can play.')
  } finally {
    await close()
  }
}

export function SoundPanel({ project }: { project: Project }) {
  const apply = useEditor((s) => s.apply)
  const toast = useApp((s) => s.toast)
  const reset = useStudio((s) => s.reset)
  const [adding, setAdding] = useState(false)
  const hasMain = project.media.hasAudio
  const mainLabel = project.media.cursorEmbedded ? 'Original audio' : project.sound.tracks.some((t) => t.kind === 'microphone') ? 'System audio' : 'Recorded audio'

  const add = async () => {
    setAdding(true)
    try {
      const file = await window.frameflow.media.chooseAudio()
      if (!file) return
      await assertPlayableAudio(file)
      const label = file.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Audio'
      apply((p) => addSoundTrack(p, file, label).project)
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="sound-panel">
      <div className="flex items-start justify-between px-5 pb-1 pt-5">
        <div>
          <h2 className="font-display text-[30px] leading-none">Sound</h2>
          <p className="mt-1.5 text-[12.5px] text-ink-2">Mixed into the export, and cut with the video.</p>
        </div>
        <IconButton label="Close panel" onClick={() => reset('moments')}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Recording">
          {hasMain ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunk text-ink-2">
                <Volume2 size={15} />
              </span>
              <div className="flex-1">
                <Slider label={mainLabel} value={project.sound.mainGain} min={0} max={2} step={0.05} onChange={(g) => apply((p) => setMainGain(p, g), 'sound-main')} format={pct} />
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-ink-2">This video was recorded without sound. Add narration or music below.</p>
          )}
        </Section>
        <Section title="Tracks" description="Each track starts with the video.">
          {project.sound.tracks.length === 0 && <p className="text-[12.5px] text-ink-3">No extra tracks yet.</p>}
          {project.sound.tracks.map((t) => (
            <div key={t.id} className="rounded-[12px] bg-sunk/70 p-3" data-testid={`sound-track-${t.kind}`}>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2 shadow-[var(--shadow-soft)]">
                  {t.kind === 'microphone' ? <Mic size={13} /> : <AudioLines size={13} />}
                </span>
                <input
                  aria-label="Track name"
                  defaultValue={t.label}
                  onBlur={(e) => e.target.value.trim() !== t.label && apply((p) => updateSoundTrack(p, t.id, { label: e.target.value.trim() }))}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-[13px] font-medium text-ink outline-none focus:bg-surface focus:ring-2 focus:ring-lavender"
                />
                <IconButton label={`Remove ${t.label}`} onClick={() => apply((p) => removeSoundTrack(p, t.id))}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <div className="mt-2">
                <Slider label="Level" value={t.gain} min={0} max={2} step={0.05} onChange={(g) => apply((p) => updateSoundTrack(p, t.id, { gain: g }), `sound-${t.id}`)} format={pct} />
              </div>
            </div>
          ))}
          <Button className="w-full" onClick={add} disabled={adding} data-testid="add-audio">
            <Plus size={14} /> Add audio file…
          </Button>
        </Section>
      </div>
    </div>
  )
}
