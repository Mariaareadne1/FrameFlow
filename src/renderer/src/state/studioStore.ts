import { create } from 'zustand'

/**
 * Which part of the Studio is open. Purely UI state: it never touches the project, so
 * switching sections cannot lose edits or move the playhead.
 */
export type StudioSection = 'moments' | 'design' | 'camera' | 'cursor' | 'sound' | 'timeline'

interface StudioState {
  section: StudioSection
  /** Whether the right-hand inspector drawer is showing (Design/Camera/Cursor or a selection). */
  drawer: boolean
  open(section: StudioSection): void
  closeDrawer(): void
  reset(section?: StudioSection): void
}

export const useStudio = create<StudioState>((set, get) => ({
  section: 'moments',
  drawer: false,
  open: (section) => {
    const { section: current, drawer } = get()
    const isPanel = section === 'design' || section === 'camera' || section === 'cursor' || section === 'sound'
    // Clicking the open panel again closes it and returns to Moments.
    if (isPanel && current === section && drawer) set({ section: 'moments', drawer: false })
    else set({ section, drawer: isPanel })
  },
  closeDrawer: () => set({ drawer: false }),
  reset: (section = 'moments') => set({ section, drawer: false }),
}))
