// ============================================================================
// Blackjack Trainer — shared domain contract.
// Every engine module, store, and UI component imports from here.
// Implementers: do not change these signatures without coordinating; the whole
// app compiles against this file.
// ============================================================================

// --- Cards ------------------------------------------------------------------
export type Suit = 'S' | 'H' | 'D' | 'C'
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  rank: Rank
  suit: Suit
  /** Unique id within a shoe, used as a stable React key. */
  id: string
}

/** Blackjack value of a rank: A=11 (soft), faces/10 = 10. */
export const RANK_VALUE: Record<Rank, number> = {
  A: 11, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 10, Q: 10, K: 10,
}

/** Hi-Lo tag for a rank: 2-6 = +1, 7-9 = 0, 10-A = -1. */
export const HILO_VALUE: Record<Rank, number> = {
  '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
  '7': 0, '8': 0, '9': 0,
  '10': -1, J: -1, Q: -1, K: -1, A: -1,
}

// --- Actions ----------------------------------------------------------------
export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender'

// --- Hand evaluation --------------------------------------------------------
export interface HandValue {
  /** Best total <= 21 when possible; lowest total otherwise. */
  total: number
  /** True if an ace is currently counted as 11. */
  soft: boolean
  /** Natural blackjack (two cards totalling 21). */
  isBlackjack: boolean
  /** total > 21. */
  isBust: boolean
  /** True when the hand is exactly two cards of equal blackjack value. */
  isPair: boolean
  /** The pair's rank when isPair (e.g. '8'); null otherwise. Tens count as a pair. */
  pairRank: Rank | null
}

// --- Rules / settings -------------------------------------------------------
/** Only S17 is implemented for now; H17 reserved for a future ruleset. */
export type Ruleset = 'S17' | 'H17'
export type CountSystem = 'HiLo'

export interface Settings {
  ruleset: Ruleset
  /** Number of decks in the shoe (1..8). */
  decks: number
  /** Late surrender offered / allowed. */
  surrenderEnabled: boolean
  /** Double after split allowed (affects basic strategy). */
  dasEnabled: boolean
  /** Show the running count on the table. */
  showRunningCount: boolean
  /** Show the true count on the table. */
  showTrueCount: boolean
  /** Allow the "Show correct move" hint button before acting. */
  showCorrectMove: boolean
  /** Player-controlled hands (boxes) at your seat in Play mode (1..5). */
  numHands: number
  /** Bot players seated at the table in Play mode (0..6). Total seats <= 7. */
  numOtherPlayers: number
  /**
   * Your seat position in deal order, 0 = first base (dealt first). Clamped to
   * the number of other players, so the default sentinel keeps you last (third
   * base) regardless of how many bots are seated.
   */
  humanSeatPosition: number
  /** Fraction of the shoe dealt before reshuffle (cut card), e.g. 0.75. */
  penetration: number
  countSystem: CountSystem
  /**
   * Limit which Hi-Lo index plays count as "correct" (and are drilled) to those
   * whose boundary index falls within [deviationRangeMin, deviationRangeMax].
   * When false, the full index set is used.
   */
  deviationRangeEnabled: boolean
  /** Lowest index (true count) deviation you want to train, e.g. -3. */
  deviationRangeMin: number
  /** Highest index (true count) deviation you want to train, e.g. +6. */
  deviationRangeMax: number
}

export const DEFAULT_SETTINGS: Settings = {
  ruleset: 'S17',
  decks: 6,
  surrenderEnabled: false,
  dasEnabled: true,
  showRunningCount: false,
  showTrueCount: false,
  showCorrectMove: false,
  numHands: 1,
  numOtherPlayers: 0,
  // Sentinel: large value clamps to "last seat" (third base) at deal time.
  humanSeatPosition: 99,
  penetration: 0.75,
  countSystem: 'HiLo',
  deviationRangeEnabled: false,
  deviationRangeMin: -3,
  deviationRangeMax: 6,
}

// --- Strategy contract ------------------------------------------------------
/** Dealer upcard expressed numerically: 2..10, and 11 for Ace. */
export type UpcardValue = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export interface StrategyContext {
  playerCards: Card[]
  dealerUpcard: Card
  /** Exact true count (running / decks remaining), not rounded. */
  trueCount: number
  /** Legal to double on this hand (typically first two cards). */
  canDouble: boolean
  /** Legal to split (pair, under split cap). */
  canSplit: boolean
  /** Legal to surrender (first decision, two cards, surrender enabled). */
  canSurrender: boolean
  ruleset: Ruleset
  dasEnabled: boolean
  /**
   * When set, only index plays whose boundary index is within [min, max] are
   * eligible to deviate; others fall back to basic strategy. Omitted/null means
   * the full index set applies (bots always get the full set).
   */
  deviationRange?: { min: number; max: number } | null
}

export interface StrategyDecision {
  /** The correct action to take given count + legality. */
  action: Action
  /** Action basic strategy alone recommends (ignoring the count). */
  basicAction: Action
  /** True when `action` differs from `basicAction` due to the count. */
  isDeviation: boolean
  /** Human-readable rationale, e.g. "16 vs 10: stand at TC ≥ 0". */
  reason: string
  /** The matched index play id, when a deviation applied or was relevant. */
  indexId?: string
}

// --- Deviations (Hi-Lo index plays) ----------------------------------------
export type HandKind = 'hard' | 'soft' | 'pair' | 'insurance'

/**
 * A single index play. Interpretation:
 *   compare the live true count to `index` using `comparator`.
 *   When the comparison is TRUE, take `action`; otherwise the basic-strategy
 *   action applies. `gte` => deviate when trueCount >= index (rich-deck plays);
 *   `lte` => deviate when trueCount <= index.
 */
export interface IndexPlay {
  id: string
  kind: HandKind
  /** Hard/soft total this applies to (e.g. 16). Omitted for pairs/insurance. */
  total?: number
  /** Pair rank for `kind: 'pair'` (e.g. '10', 'A'). */
  pairRank?: Rank
  /** Dealer upcard value (2..11). Omitted for insurance (any upcard / Ace). */
  upcard?: UpcardValue
  index: number
  comparator: 'gte' | 'lte'
  /** Action taken when the comparison is true. */
  action: Action
  /** Basic-strategy action when the comparison is false. */
  basicAction: Action
  description: string
}

// --- Counting ---------------------------------------------------------------
export interface CountState {
  /** Running Hi-Lo count over all revealed cards. */
  running: number
  /** Decks remaining in the shoe (cardsRemaining / 52), exact. */
  decksRemaining: number
  /** Exact true count = running / max(decksRemaining, tiny). */
  trueCount: number
}

// ============================================================================
// View models (the game store exposes these to the UI).
// ============================================================================
export type HandOutcome =
  | 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' | 'bust' | 'pending'

export interface PlayerHandView {
  id: string
  /**
   * The original betting box this hand descends from. Split children inherit
   * their parent's boxId, so the "max 4 hands per box" resplit cap can be
   * counted per box instead of per seat.
   */
  boxId: string
  cards: Card[]
  value: HandValue
  bet: number
  /** Currently the acting hand. */
  isActive: boolean
  isDone: boolean
  isDoubled: boolean
  isSurrendered: boolean
  /** Created by a split. */
  fromSplit: boolean
  outcome: HandOutcome
  /** Net chips won/lost on this hand after settle (e.g. +1, -1, +1.5). */
  net: number
}

export interface SeatView {
  id: string
  label: string
  /** The human player's seat (false for bots). */
  isHuman: boolean
  hands: PlayerHandView[]
}

export interface DealerView {
  cards: Card[]
  value: HandValue
  upcard: Card | null
  holeRevealed: boolean
}

export type RoundPhase =
  | 'idle'
  | 'dealing'
  | 'playerTurn'
  | 'dealerTurn'
  | 'settle'
  | 'roundOver'

export interface MistakeRecord {
  id: string
  mode: GameMode
  playerCards: Card[]
  dealerUpcard: Card
  trueCount: number
  runningCount: number
  chosen: Action
  correct: Action
  isDeviation: boolean
  reason: string
  /** Monotonic counter (not wall-clock) so it is deterministic in tests. */
  seq: number
}

export type GameMode = 'play' | 'drill'

// --- Drill mode -------------------------------------------------------------
export interface DrillScenario {
  id: string
  indexId: string
  /** The pre-chosen true count for this spot. */
  trueCount: number
  runningCount: number
  decksRemaining: number
  playerCards: Card[]
  dealerUpcard: Card
  /** Pre-computed correct decision for this spot. */
  correct: StrategyDecision
  /** Short prompt, e.g. "Hard 16 vs 10 — TC +1". */
  label: string
}

// ============================================================================
// Store contracts. UI components code against these hook shapes.
// ============================================================================
export interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
}

export interface GameStore {
  // --- shared ---
  mode: GameMode
  phase: RoundPhase
  count: CountState
  /** True count shown to the user (rounded for display). */
  displayTrueCount: number
  seats: SeatView[]
  dealer: DealerView
  /** Index of the human seat within `seats`. */
  humanSeatIndex: number
  mistakes: MistakeRecord[]
  /** Total decisions the human has made this session. */
  decisionsCount: number
  /** Revealed hint for the active hand, when the user pressed "Show". */
  hint: StrategyDecision | null
  /** Legal actions for the active human hand right now. */
  legalActions: Action[]
  /** Whether a session is active (vs. on the summary/home screen). */
  sessionActive: boolean

  // --- play mode ---
  startPlayRound: () => void
  /** Apply an action to the active human hand. */
  act: (action: Action) => void

  // --- drill mode ---
  drill: DrillScenario | null
  startDrillSession: () => void
  /** Advance to the next drill scenario. */
  nextDrill: () => void

  // --- common controls ---
  /** Reveal the correct move for the active hand (requires setting enabled). */
  revealHint: () => void
  /** End the session and route to the summary. */
  endSession: () => void
  /** Clear state back to idle/home. */
  resetSession: () => void
}

// --- Navigation -------------------------------------------------------------
export type Screen = 'home' | 'play' | 'drill' | 'settings' | 'summary'
