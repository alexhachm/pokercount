import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Card } from '@/types'
import { spotForHand, spotKey } from '@/engine/chartSpots'

// ============================================================================
// Lifetime per-spot training stats (backs the Charts screen accuracy view).
//
// This lives in its OWN persisted store rather than in gameStore because the
// game store's counters are session-scoped: startPlayRound / startDrillSession
// / resetSession all wipe mistakes and decisionsCount, and HomeScreen calls
// resetSession() on every Play tap. Lifetime accuracy must survive all of
// that, so only the explicit "Reset chart stats" button clears it.
//
// Import direction matters: this store may import types/engine only. Importing
// gameStore here would create a cycle (uiStore -> gameStore -> statsStore).
// ============================================================================

export interface SpotStat {
  attempts: number
  correct: number
}

interface StatsStore {
  /** Keyed by spotKey(), e.g. "hard-16-v-10". */
  spots: Record<string, SpotStat>
  /**
   * Record one graded decision against its chart spot. Every graded hand maps
   * to a spot (spotForHand mirrors the resolver's routing, e.g. a multi-card
   * soft 21 lands on the hard-21 row just as the grader plays it), so every
   * decision the game grades is counted here.
   */
  recordSpotDecision: (playerCards: Card[], dealerUpcard: Card, wasCorrect: boolean) => void
  /**
   * Record one graded insurance decision. Insurance has no chart cell (it is
   * a bet, not a play on a hand), so it gets its own reserved key.
   */
  recordInsuranceDecision: (wasCorrect: boolean) => void
  /** Wipe all lifetime stats (Charts screen reset button only). */
  resetStats: () => void
}

/** Reserved spots key for insurance decisions (never produced by spotKey). */
export const INSURANCE_STAT_KEY = 'insurance'

export const useStats = create<StatsStore>()(
  persist(
    (set, get) => {
      /** Shared tally: one attempt against `key`, correct or not. */
      const bump = (key: string, wasCorrect: boolean) => {
        const prev = get().spots[key] ?? { attempts: 0, correct: 0 }
        set({
          spots: {
            ...get().spots,
            [key]: {
              attempts: prev.attempts + 1,
              correct: prev.correct + (wasCorrect ? 1 : 0),
            },
          },
        })
      }

      return {
      spots: {},

      recordSpotDecision: (playerCards, dealerUpcard, wasCorrect) => {
        // Defensive: callers cast dealer.upcard from Card | null; a null here
        // means there is nothing meaningful to record.
        if (!dealerUpcard || playerCards.length === 0) return
        bump(spotKey(spotForHand(playerCards, dealerUpcard)), wasCorrect)
      },

      recordInsuranceDecision: (wasCorrect) => bump(INSURANCE_STAT_KEY, wasCorrect),

      resetStats: () => set({ spots: {} }),
      }
    },
    {
      name: 'bj-trainer-spot-stats',
      version: 1,
      // Persist only the data record; actions are re-created on load.
      partialize: (s) => ({ spots: s.spots }),
    },
  ),
)
