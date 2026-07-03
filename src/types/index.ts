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
/** Dealer stands on soft 17 (S17) or hits soft 17 (H17). */
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
  /**
   * Mix "false deviation" spots into the drill: hands that resemble index
   * plays (same totals, tempting true counts) but have no Hi-Lo index, so
   * basic strategy stays correct. Trains locating real indices, not just
   * recognizing drilled spots. Also shuffles the drill order.
   */
  drillFalseSpots: boolean
  /**
   * Pacing multiplier applied to every dealing/bot/dealer delay in Play mode.
   * 1 = normal; higher is slower (easier to follow), lower is faster (more
   * reps). The store clamps to a sane range, so stale persisted values are
   * harmless. Card fly-in animation length is unaffected.
   */
  dealSpeed: number
  /**
   * Show each hand's total under its cards (e.g. the "16" beneath 7♥ 9♥).
   * Turn off to practice reading totals yourself.
   */
  showHandTotals: boolean
  /**
   * Hand-shape training filter, applied to YOUR hands only. In Play mode the
   * opening deal rigs your two cards to an enabled shape (bots and the dealer
   * draw naturally); in the deviation/TC drills only index plays of enabled
   * kinds are queued. All three on = no filtering. All three off is treated
   * as all-on so a stale persisted state can never mean "deal nothing".
   */
  trainHard: boolean
  trainSoft: boolean
  trainPairs: boolean
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
  drillFalseSpots: false,
  dealSpeed: 1,
  showHandTotals: true,
  trainHard: true,
  trainSoft: true,
  trainPairs: true,
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
  /** Dealer shows an Ace: waiting on the human's insurance decision (pre-peek). */
  | 'insurance'
  | 'playerTurn'
  | 'dealerTurn'
  | 'settle'
  | 'roundOver'

/**
 * The insurance decision expressed as a pseudo-action so mistake records can
 * carry it through the same chosen/correct fields the Summary screen renders.
 */
export type InsuranceChoice = 'insurance' | 'no insurance'

export interface MistakeRecord {
  id: string
  mode: GameMode
  playerCards: Card[]
  dealerUpcard: Card
  trueCount: number
  runningCount: number
  /** TC-drill answers are free-form labels (e.g. "stand at TC +3", "no deviation"). */
  chosen: Action | InsuranceChoice | string
  correct: Action | InsuranceChoice | string
  isDeviation: boolean
  reason: string
  /** Monotonic counter (not wall-clock) so it is deterministic in tests. */
  seq: number
}

export type GameMode = 'play' | 'drill' | 'tcdrill'

/** The bot action currently being announced on the table (badge over the hand). */
export interface BotActionView {
  seatIndex: number
  handIndex: number
  action: Action
}

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

// --- TC drill mode ------------------------------------------------------------
/**
 * A TC-drill spot: the hand and upcard are shown WITHOUT a true count. The
 * user must recall whether the spot has a Hi-Lo index at all, and if so type
 * the boundary true count and pick the deviation action. Decoy spots (no
 * index play exists) carry null deviation fields; "No deviation" is their
 * correct answer.
 */
export interface TcDrillScenario {
  id: string
  /** Matched index play id, or 'none' for decoy spots. */
  indexId: string
  playerCards: Card[]
  dealerUpcard: Card
  /** Boundary true count at which the deviation applies; null for decoys. */
  deviationIndex: number | null
  /** 'gte' => deviate at TC >= index; 'lte' => at TC <= index; null for decoys. */
  comparator: 'gte' | 'lte' | null
  /** Action taken when the count triggers the play; null for decoys. */
  deviationAction: Action | null
  /** Basic-strategy action for the spot (what decoys resolve to). */
  basicAction: Action
  /** Feedback text, e.g. "16 v 10: stand at TC >= 0". */
  reason: string
  /** Short prompt WITHOUT the count, e.g. "Hard 16 vs 10". */
  label: string
}

/** The user's answer to a TC-drill spot. */
export interface TcDrillAnswer {
  /** True = "this spot has an index play"; false = "no deviation exists". */
  deviation: boolean
  /** Typed integer boundary TC (required when deviation is true). */
  tc?: number
  /** Chosen deviation action (required when deviation is true). */
  action?: Action
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
  /** Bot action being announced right now (drives the table badge). */
  botAction: BotActionView | null

  // --- play mode ---
  startPlayRound: () => void
  /** Apply an action to the active human hand. */
  act: (action: Action) => void
  /**
   * Whether the human took insurance this round; null until the dealer shows
   * an Ace and the decision is made (and for all no-Ace rounds).
   */
  insuranceTaken: boolean | null
  /** Settled insurance result in units (+1/box on dealer BJ, -0.5/box else). */
  insuranceNet: number
  /** Answer the insurance offer (phase 'insurance'); performs the peek. */
  takeInsurance: (take: boolean) => void

  // --- drill mode ---
  drill: DrillScenario | null
  startDrillSession: () => void
  /** Advance to the next drill scenario. */
  nextDrill: () => void

  // --- TC drill mode ---
  tcDrill: TcDrillScenario | null
  startTcDrillSession: () => void
  /** Grade the typed-TC answer for the current TC-drill spot. */
  answerTcDrill: (answer: TcDrillAnswer) => void
  /** Advance to the next TC-drill scenario. */
  nextTcDrill: () => void

  // --- common controls ---
  /** Reveal the correct move for the active hand (requires setting enabled). */
  revealHint: () => void
  /** End the session and route to the summary. */
  endSession: () => void
  /** Clear state back to idle/home. */
  resetSession: () => void
}

// --- Navigation -------------------------------------------------------------
export type Screen =
  | 'home' | 'play' | 'drill' | 'tcdrill' | 'settings' | 'summary' | 'charts'
