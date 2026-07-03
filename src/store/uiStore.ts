import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Screen } from '@/types'
import { useGame } from '@/store/gameStore'

interface UiStore {
  screen: Screen
  go: (screen: Screen) => void
}

/** Lightweight screen navigation (no router needed for an offline PWA). */
export const useUi = create<UiStore>()(
  persist(
    (set) => ({
      screen: 'home',
      go: (screen) => {
        // Screens swap inside one always-mounted container; #root is the
        // scroller (html/body are overflow: hidden), so reset it so a new
        // screen never inherits a stale scroll offset from the previous one.
        document.getElementById('root')?.scrollTo(0, 0)
        set({ screen })
      },
    }),
    {
      name: 'bj-trainer-ui',
      partialize: (state) => ({ screen: state.screen }),
      // iOS silently kills suspended standalone PWAs; restore the user to
      // Play/Drill only if the game session survived rehydration, otherwise
      // those screens would be dead UI — fall back to Home.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<UiStore>) }
        if (
          (state.screen === 'play' || state.screen === 'drill' || state.screen === 'tcdrill') &&
          !useGame.getState().sessionActive
        ) {
          state.screen = 'home'
        }
        return state
      },
    },
  ),
)
