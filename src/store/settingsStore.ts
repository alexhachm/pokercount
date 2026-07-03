import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SETTINGS, type Settings, type SettingsStore } from '@/types'

/**
 * Persisted user settings (localStorage). Everything in the app reads rules
 * and toggles from here.
 */
export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) =>
        set((state) => {
          const next: Partial<Settings> = { [key]: value }
          // Lowering the player count must pull a previously-chosen seat back in
          // range, so a stale high seat can't silently re-emerge if the count is
          // raised again later. The 99 sentinel ("last seat") is left untouched.
          if (key === 'numOtherPlayers') {
            const v = value as number
            if (state.humanSeatPosition !== 99 && state.humanSeatPosition > v) {
              next.humanSeatPosition = v
            }
          }
          return next as Partial<Settings>
        }),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'bj-trainer-settings',
      version: 1,
    },
  ),
)
