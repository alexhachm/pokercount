import { create } from 'zustand'
import type { Screen } from '@/types'

interface UiStore {
  screen: Screen
  go: (screen: Screen) => void
}

/** Lightweight screen navigation (no router needed for an offline PWA). */
export const useUi = create<UiStore>((set) => ({
  screen: 'home',
  go: (screen) => set({ screen }),
}))
