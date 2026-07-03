import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  type Action,
  type BotActionView,
  type Card,
  type CountState,
  type DealerView,
  type DrillScenario,
  type GameMode,
  type GameStore,
  type HandOutcome,
  type InsuranceChoice,
  type MistakeRecord,
  type PlayerHandView,
  type SeatView,
  type StrategyContext,
  type StrategyDecision,
  type TcDrillAnswer,
  type TcDrillScenario,
} from '@/types'
import { Shoe } from '@/engine/shoe'
import { evaluate, isBlackjack } from '@/engine/hand'
import { hiLoTag, trueCount as computeTrueCount } from '@/engine/count'
import { dealerShouldHit } from '@/engine/dealer'
import { getCorrectPlay } from '@/engine/strategy'
import { INDEX_PLAYS } from '@/engine/deviations'
import { botDecision } from '@/engine/bots'
import { buildDrillQueue, buildTcDrillQueue } from '@/engine/drillEngine'
import { useSettings } from '@/store/settingsStore'
import { useStats } from '@/store/statsStore'

// Internal store shape extends the public contract with private bookkeeping.
interface GameInternal extends GameStore {
  _shoe: Shoe | null
  _activeSeat: number
  _activeHand: number
  _seq: number
  _drillQueue: DrillScenario[]
  _drillIndex: number
  _drillAnswered: boolean
  _tcDrillQueue: TcDrillScenario[]
  _tcDrillIndex: number
  _tcDrillAnswered: boolean
  /** Restart a round persisted mid-animation (called once on startup). */
  _kick: () => void
}

// ---------------------------------------------------------------------------
// Animation pacing. The round no longer resolves in one synchronous update:
// a tick() state machine reveals one card / one bot action per step so the
// player can follow the running count as it changes. Timings are deliberately
// quick — this is a reps-per-minute trainer, not a cinematic.
// In Node (tests) there is no window: ticks run synchronously so the smoke
// tests can drive a whole round with plain calls.
// ---------------------------------------------------------------------------
const IS_BROWSER = typeof window !== 'undefined'
const DEAL_MS = 120 // between cards of the initial deal
const BOT_THINK_MS = 260 // bot action badge shown before the action lands
const BOT_STEP_MS = 150 // after a bot card lands, before the next decision
const HOLE_MS = 280 // pause on the hole reveal so it registers
const DEALER_DRAW_MS = 220 // between dealer hits
const TURN_MS = 140 // advancing between hands / into the dealer phase

// iOS silently kills suspended standalone PWAs (app switch, screen lock,
// memory pressure), which would wipe a mid-shoe session — count, seats, drill
// progress, and the whole mistake log the Summary screen depends on. The
// session is therefore persisted to localStorage (uiStore's merge already
// checks `sessionActive` to decide whether to restore the Play/Drill screen).
// The Shoe is a class instance, so it is snapshotted to a plain object and
// rebuilt on rehydration; its TS-private fields are plain runtime properties.
interface ShoeSnapshot {
  decks: number
  cards: Card[]
  drawn: number
}

type ShoeInternals = { cards: Card[]; drawn: number }

function snapshotShoe(shoe: Shoe | null): ShoeSnapshot | null {
  if (!shoe) return null
  const internals = shoe as unknown as ShoeInternals
  return { decks: shoe.decks, cards: [...internals.cards], drawn: internals.drawn }
}

function restoreShoe(snap: ShoeSnapshot | null | undefined): Shoe | null {
  if (!snap) return null
  const shoe = new Shoe(snap.decks)
  const internals = shoe as unknown as ShoeInternals
  internals.cards = [...snap.cards]
  internals.drawn = snap.drawn
  return shoe
}

const tagSum = (cards: Card[]) => cards.reduce((s, c) => s + hiLoTag(c), 0)

/** Signed integer TC label for TC-drill feedback: "+3", "0", "-2". */
const fmtTc = (n: number) => (n > 0 ? `+${n}` : String(n))

function emptyDealer(): DealerView {
  return { cards: [], value: evaluate([]), upcard: null, holeRevealed: false }
}

function freshHand(id: string, fromSplit = false, boxId: string = id): PlayerHandView {
  return {
    id,
    boxId,
    cards: [],
    value: evaluate([]),
    bet: 1,
    isActive: false,
    isDone: false,
    isDoubled: false,
    isSurrendered: false,
    fromSplit,
    outcome: 'pending',
    net: 0,
  }
}

function refreshValue(h: PlayerHandView): PlayerHandView {
  h.value = evaluate(h.cards)
  return h
}

function upcardValue(card: Card): StrategyContext['dealerUpcard'] {
  return card
}

// ---------------------------------------------------------------------------
export const useGame = create<GameInternal>()(
  persist((set, get) => {
  // --- low-level helpers -------------------------------------------------
  const settings = () => useSettings.getState()

  const setCount = (running: number, decksRemaining: number) => {
    const tc = computeTrueCount(running, decksRemaining)
    const count: CountState = { running, decksRemaining, trueCount: tc }
    set({ count, displayTrueCount: Math.round(tc * 10) / 10 })
  }

  const decksRemaining = () => {
    const shoe = get()._shoe
    return shoe ? shoe.decksRemaining : 1
  }

  /** Add the Hi-Lo tags of newly revealed cards to the running count. */
  const reveal = (cards: Card[]) => {
    const running = get().count.running + tagSum(cards)
    setCount(running, decksRemaining())
  }

  const cloneSeats = (seats: SeatView[]): SeatView[] =>
    seats.map((s) => ({ ...s, hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })) }))

  const cloneDealer = (): DealerView => ({ ...get().dealer, cards: [...get().dealer.cards] })

  /** The active deviation-range limit, or null when the limit is off. */
  const devRange = (): { min: number; max: number } | null => {
    const st = settings()
    return st.deviationRangeEnabled
      ? { min: st.deviationRangeMin, max: st.deviationRangeMax }
      : null
  }

  // --- tick scheduling -----------------------------------------------------
  // At most one pending timer; module state, deliberately NOT persisted.
  let tickTimer: ReturnType<typeof setTimeout> | null = null

  const clearTick = () => {
    if (tickTimer !== null) {
      clearTimeout(tickTimer)
      tickTimer = null
    }
  }

  const scheduleTick = (ms: number) => {
    clearTick()
    if (!IS_BROWSER) {
      tick()
      return
    }
    // The user-facing dealing-speed setting scales every step delay. Clamp so
    // a stale/garbage persisted value can neither freeze nor teleport a round.
    const speed = Math.min(3, Math.max(0.25, settings().dealSpeed || 1))
    tickTimer = setTimeout(() => {
      tickTimer = null
      tick()
    }, Math.round(ms * speed))
  }

  /**
   * Split the pair in `seat.hands[hi]` into two hands in place, drawing one card
   * for each and revealing both for the count. Split aces get a single card and
   * are immediately done. Shared by the human and bot turn logic.
   */
  const splitHand = (seat: SeatView, hi: number, hand: PlayerHandView) => {
    const shoe = get()._shoe!
    const [a, b] = hand.cards
    const isAces = a.rank === 'A'
    // Children inherit the box so the resplit cap is counted per box, not seat.
    const h1 = freshHand(`${hand.id}-1`, true, hand.boxId)
    const h2 = freshHand(`${hand.id}-2`, true, hand.boxId)
    h1.cards = [a, shoe.draw()]
    h2.cards = [b, shoe.draw()]
    reveal([h1.cards[1], h2.cards[1]])
    refreshValue(h1)
    refreshValue(h2)
    if (isAces) {
      h1.isDone = true
      h2.isDone = true
    }
    seat.hands.splice(hi, 1, h1, h2)
  }

  /** Hands currently belonging to the same betting box (for the resplit cap). */
  const boxHandCount = (seat: SeatView, hand: PlayerHandView) =>
    seat.hands.filter((h) => h.boxId === hand.boxId).length

  // --- legal actions for the active human hand (play mode) ---------------
  const legalFor = (hand: PlayerHandView, seat: SeatView): Action[] => {
    const st = settings()
    const acts: Action[] = ['hit', 'stand']
    const firstDecision = hand.cards.length === 2
    if (firstDecision) {
      const canDouble = !hand.fromSplit || st.dasEnabled
      if (canDouble) acts.push('double')
      if (hand.value.isPair && boxHandCount(seat, hand) < 4) acts.push('split')
      if (st.surrenderEnabled && !hand.fromSplit) acts.push('surrender')
    }
    return acts
  }

  const ctxFor = (
    hand: PlayerHandView,
    seat: SeatView,
    forBot = false,
  ): StrategyContext => {
    const st = settings()
    const dealer = get().dealer
    const first = hand.cards.length === 2
    return {
      playerCards: hand.cards,
      dealerUpcard: upcardValue(dealer.upcard as Card),
      trueCount: get().count.trueCount,
      canDouble: first && (!hand.fromSplit || st.dasEnabled),
      // Bots can split too (up to 4 hands per box); aces only get one card.
      canSplit: first && hand.value.isPair && boxHandCount(seat, hand) < 4,
      canSurrender: !forBot ? st.surrenderEnabled && first && !hand.fromSplit : false,
      ruleset: st.ruleset,
      dasEnabled: st.dasEnabled,
      // Bots always use the full index set; the range limit is the human's
      // training aid and applies only when evaluating the human's play.
      deviationRange: forBot ? null : devRange(),
    }
  }

  // --- turn progression --------------------------------------------------
  const setActiveFlags = (seats: SeatView[], sIdx: number, hIdx: number) => {
    seats.forEach((s, si) =>
      s.hands.forEach((h, hi) => {
        h.isActive = si === sIdx && hi === hIdx
      }),
    )
  }

  // ---------------------------------------------------------------------
  // The round state machine. Each tick performs ONE visible step (one card
  // dealt, one bot action announced or applied, one dealer draw) and then
  // schedules the next tick, so the on-screen count moves card by card.
  // Everything the machine needs lives in persisted state, which makes a
  // mid-animation relaunch resumable via _kick().
  // ---------------------------------------------------------------------
  const tick = () => {
    const g = get()
    if (!g.sessionActive || g.mode !== 'play') return
    try {
      if (g.phase === 'dealing') dealStep()
      else if (g.phase === 'playerTurn') turnStep()
      else if (g.phase === 'dealerTurn') dealerStep()
    } catch {
      // A mid-step failure (worst case: the shoe running dry in a pathological
      // splits round) must never strand a persisted mid-round phase — that
      // would re-throw via _kick on every relaunch. Settle what's on the table;
      // the drained shoe forces a reshuffle on the next deal.
      clearTick()
      settle()
    }
  }

  /**
   * Deal the next card of the opening deal, derived from what is already on
   * the table: one pass to every box in seat order, then the upcard, the
   * second pass, then the hole. Ends with the peek check and hands off to
   * the turns (or straight to the dealer on a peeked blackjack).
   */
  const dealStep = () => {
    const shoe = get()._shoe!
    const seats = cloneSeats(get().seats)
    const dealer = cloneDealer()

    const dealToHandWith = (count: number): boolean => {
      for (const seat of seats) {
        for (const hand of seat.hands) {
          if (hand.cards.length === count) {
            const c = shoe.draw()
            hand.cards.push(c)
            refreshValue(hand)
            reveal([c])
            set({ seats })
            scheduleTick(DEAL_MS)
            return true
          }
        }
      }
      return false
    }

    // First pass to the boxes, then the upcard.
    if (dealToHandWith(0)) return
    if (dealer.cards.length === 0) {
      const dc = shoe.draw()
      dealer.cards.push(dc)
      dealer.upcard = dc
      dealer.value = evaluate(dealer.cards)
      reveal([dc])
      set({ dealer })
      scheduleTick(DEAL_MS)
      return
    }
    // Second pass to the boxes, then the hole (face down — not counted).
    if (dealToHandWith(1)) return
    if (dealer.cards.length === 1) {
      dealer.cards.push(shoe.draw())
      dealer.value = evaluate(dealer.cards)
      set({ dealer })
      // The hole card leaves the shoe even though its tag stays uncounted:
      // refresh the true-count divisor so first decisions match the old
      // engine exactly (a stale divisor can flip index plays at boundaries).
      setCount(get().count.running, shoe.decksRemaining)
      scheduleTick(DEAL_MS)
      return
    }

    // Deal complete. With an Ace up, insurance is offered BEFORE the peek
    // (casino order): park the machine in the insurance phase and wait for
    // takeInsurance(), which grades the bet, peeks, and hands the round on.
    // Bots never take insurance — it is the human's counting decision.
    const up = dealer.cards[0]
    if (up.rank === 'A') {
      set({ phase: 'insurance', legalActions: [], hint: null })
      return // no tick; waiting on human input (like a human turn)
    }
    // Ten up: peek immediately. A peeked blackjack skips the turns entirely —
    // dealerStep reveals the hole and settles.
    if (evaluate([up]).total === 10 && isBlackjack(dealer.cards)) {
      set({ phase: 'dealerTurn' })
      scheduleTick(HOLE_MS)
      return
    }
    set({ phase: 'playerTurn', _activeSeat: 0, _activeHand: 0 })
    scheduleTick(TURN_MS)
  }

  /**
   * Advance the turns by one visible step. Finished/blackjack/bust hands are
   * skipped instantly; a human hand stops the machine and waits for act();
   * a bot hand first announces its action (the badge the table renders),
   * then applies it on the following tick.
   */
  const turnStep = () => {
    const seats = cloneSeats(get().seats)
    let si = get()._activeSeat
    let hi = get()._activeHand

    // Skip past everything that can't act.
    for (;;) {
      if (si >= seats.length) {
        setActiveFlags(seats, -1, -1)
        set({ seats, _activeSeat: si, _activeHand: hi, botAction: null, phase: 'dealerTurn' })
        scheduleTick(TURN_MS)
        return
      }
      const seat = seats[si]
      if (hi >= seat.hands.length) {
        si += 1
        hi = 0
        continue
      }
      const hand = seat.hands[hi]
      refreshValue(hand)
      if (hand.isDone || hand.value.isBlackjack || hand.value.isBust) {
        hand.isDone = true
        hi += 1
        continue
      }
      break
    }

    const seat = seats[si]
    const hand = seat.hands[hi]

    if (seat.isHuman) {
      setActiveFlags(seats, si, hi)
      set({
        seats,
        _activeSeat: si,
        _activeHand: hi,
        botAction: null,
        legalActions: legalFor(hand, seat),
        hint: null,
      })
      return // wait for act()
    }

    // Bot hand. One tick announces the decision; the next applies it.
    const announced = get().botAction
    if (!announced || announced.seatIndex !== si || announced.handIndex !== hi) {
      const action = botDecision(ctxFor(hand, seat, true))
      setActiveFlags(seats, si, hi)
      const botAction: BotActionView = { seatIndex: si, handIndex: hi, action }
      set({ seats, _activeSeat: si, _activeHand: hi, botAction })
      scheduleTick(BOT_THINK_MS)
      return
    }

    const shoe = get()._shoe!
    const action = announced.action
    if (action === 'stand') {
      hand.isDone = true
    } else if (action === 'surrender') {
      hand.isSurrendered = true
      hand.isDone = true
    } else if (action === 'double') {
      const c = shoe.draw()
      hand.cards.push(c)
      hand.isDoubled = true
      reveal([c])
      refreshValue(hand)
      hand.isDone = true
    } else if (action === 'split') {
      splitHand(seat, hi, hand)
    } else {
      // hit
      const c = shoe.draw()
      hand.cards.push(c)
      reveal([c])
      refreshValue(hand)
      if (hand.value.isBust) hand.isDone = true
    }
    set({ seats, botAction: null })
    scheduleTick(BOT_STEP_MS)
  }

  /** One dealer step per tick: reveal the hole, then draw out, then settle. */
  const dealerStep = () => {
    const shoe = get()._shoe!
    const dealer = cloneDealer()

    if (!dealer.holeRevealed) {
      dealer.holeRevealed = true
      dealer.value = evaluate(dealer.cards)
      if (dealer.cards[1]) reveal([dealer.cards[1]])
      set({ dealer })
      scheduleTick(HOLE_MS)
      return
    }

    const seats = get().seats
    const anyLive = seats.some((s) =>
      s.hands.some((h) => {
        const v = evaluate(h.cards)
        return !h.isSurrendered && !v.isBust
      }),
    )
    if (
      anyLive &&
      !isBlackjack(dealer.cards) &&
      dealerShouldHit(dealer.value, settings().ruleset)
    ) {
      const c = shoe.draw()
      dealer.cards.push(c)
      dealer.value = evaluate(dealer.cards)
      reveal([c])
      set({ dealer })
      scheduleTick(DEALER_DRAW_MS)
      return
    }
    settle()
  }

  const settle = () => {
    const dealer = get().dealer
    const dVal = evaluate(dealer.cards)
    const dBJ = isBlackjack(dealer.cards)
    const seats = cloneSeats(get().seats)
    for (const seat of seats) {
      for (const hand of seat.hands) {
        const v = evaluate(hand.cards)
        const mult = hand.isDoubled ? 2 : 1
        let outcome: HandOutcome
        let net: number
        if (hand.isSurrendered) {
          outcome = 'surrender'
          net = -0.5
        } else if (v.isBust) {
          outcome = 'bust'
          net = -1 * mult
        } else {
          const pBJ = isBlackjack(hand.cards) && !hand.fromSplit
          if (pBJ && !dBJ) {
            outcome = 'blackjack'
            net = 1.5
          } else if (pBJ && dBJ) {
            outcome = 'push'
            net = 0
          } else if (dBJ) {
            outcome = 'lose'
            net = -1 * mult
          } else if (dVal.isBust || v.total > dVal.total) {
            outcome = 'win'
            net = 1 * mult
          } else if (v.total < dVal.total) {
            outcome = 'lose'
            net = -1 * mult
          } else {
            outcome = 'push'
            net = 0
          }
        }
        hand.outcome = outcome
        hand.net = net
        hand.isActive = false
        hand.isDone = true
      }
    }
    set({ seats, phase: 'roundOver', legalActions: [], botAction: null })
  }

  // --- mistake recording -------------------------------------------------
  const recordDecision = (
    hand: PlayerHandView,
    seat: SeatView,
    chosen: Action,
    correct: StrategyDecision,
    mode: GameMode,
  ) => {
    const st = get()
    const decisionsCount = st.decisionsCount + 1
    let mistakes = st.mistakes
    if (chosen !== correct.action) {
      const rec: MistakeRecord = {
        id: `m${st._seq}`,
        mode,
        playerCards: [...hand.cards],
        dealerUpcard: get().dealer.upcard as Card,
        trueCount: st.count.trueCount,
        runningCount: st.count.running,
        chosen,
        correct: correct.action,
        isDeviation: correct.isDeviation,
        reason: correct.reason,
        seq: st._seq,
      }
      mistakes = [...mistakes, rec]
    }
    // Lifetime per-spot accuracy (Charts screen) lives in its own persisted
    // store because everything in THIS store is wiped by session resets. Both
    // play and drill decisions funnel through recordDecision, so this one call
    // covers both modes; play mode calls it before mutating the hand, so
    // hand.cards is still the pre-action hand spotForHand needs.
    useStats
      .getState()
      .recordSpotDecision([...hand.cards], get().dealer.upcard as Card, chosen === correct.action)
    set({ decisionsCount, mistakes, _seq: st._seq + 1 })
  }

  // --- play-mode actions on the active human hand ------------------------
  const applyHumanAction = (action: Action) => {
    const seats = cloneSeats(get().seats)
    const si = get()._activeSeat
    const hi = get()._activeHand
    const seat = seats[si]
    const hand = seat.hands[hi]
    const shoe = get()._shoe!

    if (action === 'stand') {
      hand.isDone = true
    } else if (action === 'hit') {
      const c = shoe.draw()
      hand.cards.push(c)
      reveal([c])
      refreshValue(hand)
      if (hand.value.isBust) hand.isDone = true
    } else if (action === 'double') {
      const c = shoe.draw()
      hand.cards.push(c)
      hand.isDoubled = true
      hand.bet = 2
      reveal([c])
      refreshValue(hand)
      hand.isDone = true
    } else if (action === 'surrender') {
      hand.isSurrendered = true
      hand.isDone = true
    } else if (action === 'split') {
      splitHand(seat, hi, hand)
    }

    // The hand the pointer now rests on (a split replaced it with child 1).
    const current = seat.hands[hi]
    refreshValue(current)
    if (!current.isDone && !current.value.isBlackjack && !current.value.isBust) {
      // Same hand keeps acting (hit that didn't bust, fresh split child):
      // refresh legality synchronously so there is zero input latency.
      setActiveFlags(seats, si, hi)
      set({ seats, legalActions: legalFor(current, seat), hint: null })
      return
    }
    // Hand finished — hand the machine the baton to advance (bots/dealer).
    // legalActions clears so the stale button set doesn't linger through
    // trailing bot turns (mirrors the pre-human-turn state).
    current.isDone = true
    current.isActive = false
    set({ seats, hint: null, legalActions: [] })
    scheduleTick(TURN_MS)
  }

  // --- drill helpers -----------------------------------------------------
  const drillLegal = (sc: DrillScenario): Action[] => {
    const st = settings()
    const acts: Action[] = ['hit', 'stand']
    const v = evaluate(sc.playerCards)
    if (sc.playerCards.length === 2) {
      acts.push('double')
      if (v.isPair) acts.push('split')
      if (st.surrenderEnabled) acts.push('surrender')
    }
    return acts
  }

  const loadDrill = (idx: number) => {
    const q = get()._drillQueue
    if (q.length === 0) {
      set({ drill: null, phase: 'roundOver' })
      return
    }
    const sc = q[idx % q.length]
    const dealer: DealerView = {
      cards: [sc.dealerUpcard],
      value: evaluate([sc.dealerUpcard]),
      upcard: sc.dealerUpcard,
      holeRevealed: false,
    }
    const hand = refreshValue(freshHand('drill'))
    hand.cards = [...sc.playerCards]
    refreshValue(hand)
    hand.isActive = true
    const humanSeat: SeatView = { id: 'you', label: 'You', isHuman: true, hands: [hand] }
    setCount(sc.runningCount, sc.decksRemaining)
    set({
      drill: sc,
      _drillIndex: idx,
      _drillAnswered: false,
      dealer,
      seats: [humanSeat],
      humanSeatIndex: 0,
      phase: 'playerTurn',
      legalActions: drillLegal(sc),
      hint: null,
    })
  }

  // --- TC drill helpers ----------------------------------------------------
  const loadTcDrill = (idx: number) => {
    const q = get()._tcDrillQueue
    if (q.length === 0) {
      set({ tcDrill: null, phase: 'roundOver' })
      return
    }
    const sc = q[idx % q.length]
    const dealer: DealerView = {
      cards: [sc.dealerUpcard],
      value: evaluate([sc.dealerUpcard]),
      upcard: sc.dealerUpcard,
      holeRevealed: false,
    }
    const hand = refreshValue(freshHand('tcdrill'))
    hand.cards = [...sc.playerCards]
    refreshValue(hand)
    hand.isActive = true
    const humanSeat: SeatView = { id: 'you', label: 'You', isHuman: true, hands: [hand] }
    // No live count in this mode — the boundary TC is the thing being recalled.
    setCount(0, 1)
    set({
      tcDrill: sc,
      _tcDrillIndex: idx,
      _tcDrillAnswered: false,
      dealer,
      seats: [humanSeat],
      humanSeatIndex: 0,
      phase: 'playerTurn',
      legalActions: [],
      hint: null,
    })
  }

  // --- public API --------------------------------------------------------
  return {
    mode: 'play',
    phase: 'idle',
    count: { running: 0, decksRemaining: 1, trueCount: 0 },
    displayTrueCount: 0,
    seats: [],
    dealer: emptyDealer(),
    humanSeatIndex: 0,
    mistakes: [],
    decisionsCount: 0,
    hint: null,
    legalActions: [],
    sessionActive: false,
    botAction: null,
    drill: null,
    tcDrill: null,
    insuranceTaken: null,
    insuranceNet: 0,

    _shoe: null,
    _activeSeat: 0,
    _activeHand: 0,
    _seq: 0,
    _drillQueue: [],
    _drillIndex: 0,
    _drillAnswered: false,
    _tcDrillQueue: [],
    _tcDrillIndex: 0,
    _tcDrillAnswered: false,

    startPlayRound: () => {
      clearTick()
      const st = settings()
      const newSession = !get().sessionActive
      if (newSession) {
        set({ mistakes: [], decisionsCount: 0, _seq: 0, _shoe: null })
      }
      // Clamp counts to the supported caps so a stale/over-cap persisted value
      // can never breach the "7 seats total" invariant.
      const numHands = Math.min(5, Math.max(1, st.numHands))
      const numOtherPlayers = Math.min(6, Math.max(0, st.numOtherPlayers))

      let shoe = get()._shoe
      let running = get().count.running
      // Reshuffle at the cut card, on a deck-count change, or when the shoe
      // can't cover this round's opening deal plus a hits margin — the ticked
      // deal draws card by card, so running dry mid-round must not happen.
      const minNeed = (numHands + numOtherPlayers) * 2 + 2 + 8
      if (
        !shoe ||
        shoe.decks !== st.decks ||
        shoe.shouldReshuffle(st.penetration) ||
        shoe.remaining < minNeed
      ) {
        shoe = new Shoe(st.decks)
        running = 0
      }

      // Build seats in deal order (seat 0 dealt first). The human sits at the
      // chosen position; bots fill the remaining seats. The sentinel default
      // clamps to the last seat (third base), preserving the classic layout.
      const humanHands: PlayerHandView[] = []
      for (let h = 0; h < numHands; h++) humanHands.push(freshHand(`you-${h}`))
      const humanSeat: SeatView = { id: 'you', label: 'You', isHuman: true, hands: humanHands }

      const humanIndex = Math.min(Math.max(0, st.humanSeatPosition), numOtherPlayers)
      const seats: SeatView[] = []
      let botNum = 0
      for (let pos = 0; pos < numOtherPlayers + 1; pos++) {
        if (pos === humanIndex) {
          seats.push(humanSeat)
        } else {
          seats.push({
            id: `bot${botNum}`,
            label: `Player ${botNum + 1}`,
            isHuman: false,
            hands: [freshHand(`bot${botNum}`)],
          })
          botNum++
        }
      }

      // Commit an empty table first; the tick machine then deals card by
      // card so the on-screen count moves with each card, like a live table.
      set({
        mode: 'play',
        sessionActive: true,
        _shoe: shoe,
        seats,
        dealer: emptyDealer(),
        humanSeatIndex: humanIndex,
        _activeSeat: 0,
        _activeHand: 0,
        hint: null,
        legalActions: [],
        botAction: null,
        insuranceTaken: null,
        insuranceNet: 0,
        phase: 'dealing',
        // mistakes/decisions persist across rounds within a session; reset on new session via resetSession
      })
      setCount(running, shoe.decksRemaining)
      scheduleTick(DEAL_MS)
    },

    act: (action: Action) => {
      const mode = get().mode
      if (mode === 'drill') {
        const sc = get().drill
        if (!sc || get()._drillAnswered) return
        const hand = get().seats[0].hands[0]
        const seat = get().seats[0]
        recordDecision(hand, seat, action, sc.correct, 'drill')
        set({ _drillAnswered: true, phase: 'roundOver', hint: sc.correct, legalActions: [] })
        return
      }
      if (get().phase !== 'playerTurn') return
      const seat = get().seats[get()._activeSeat]
      const hand = seat?.hands[get()._activeHand]
      // The playerTurn phase now spans bot turns too — only accept input when
      // the pointer is parked on a live human hand (this also swallows a
      // double-tap landing in the between-hands tick gap).
      if (!seat || !seat.isHuman || !hand || hand.isDone) return
      if (!get().legalActions.includes(action)) return
      // record correctness BEFORE mutating
      const correct = getCorrectPlay(ctxFor(hand, seat))
      recordDecision(hand, seat, action, correct, 'play')
      applyHumanAction(action)
    },

    takeInsurance: (take: boolean) => {
      const g = get()
      if (g.mode !== 'play' || g.phase !== 'insurance') return

      // Grade the bet against the Hi-Lo insurance index (take at TC >= +3).
      // The deviation-range training limit applies like any human decision:
      // with the index outside the trained range, "correct" is always decline.
      const play = INDEX_PLAYS.find((p) => p.kind === 'insurance')
      const range = devRange()
      const trainable =
        !!play && (!range || (play.index >= range.min && play.index <= range.max))
      const shouldTake =
        trainable &&
        (play!.comparator === 'gte'
          ? g.count.trueCount >= play!.index
          : g.count.trueCount <= play!.index)

      const chosen: InsuranceChoice = take ? 'insurance' : 'no insurance'
      const correctChoice: InsuranceChoice = shouldTake ? 'insurance' : 'no insurance'
      const humanSeat = g.seats[g.humanSeatIndex]
      let mistakes = g.mistakes
      if (take !== shouldTake) {
        mistakes = [
          ...mistakes,
          {
            id: `m${g._seq}`,
            mode: 'play',
            // The bet rides on the dealer's hand, but show the player's first
            // hand so the summary card renders a real table snapshot.
            playerCards: [...(humanSeat?.hands[0]?.cards ?? [])],
            dealerUpcard: g.dealer.upcard as Card,
            trueCount: g.count.trueCount,
            runningCount: g.count.running,
            chosen,
            correct: correctChoice,
            // Taking insurance is the count-driven deviation; declining is basic.
            isDeviation: shouldTake,
            reason: play?.description ?? 'Insurance: never take (no index play)',
            seq: g._seq,
          },
        ]
      }
      useStats.getState().recordInsuranceDecision(take === shouldTake)

      // Settle the side bet off the peek result now: half a unit per box,
      // paid 2:1 -> +1 per box on a dealer blackjack, -0.5 per box otherwise.
      // (Boxes still hold their original 1-unit bets pre-double/split here.)
      const dBJ = isBlackjack(g.dealer.cards)
      const boxes = humanSeat?.hands.length ?? 1
      const insuranceNet = take ? (dBJ ? boxes : -0.5 * boxes) : 0

      set({
        decisionsCount: g.decisionsCount + 1,
        mistakes,
        _seq: g._seq + 1,
        insuranceTaken: take,
        insuranceNet,
      })

      // The deferred peek: a dealer blackjack skips the turns entirely
      // (dealerStep reveals the hole and settles), otherwise play begins.
      if (dBJ) {
        set({ phase: 'dealerTurn' })
        scheduleTick(HOLE_MS)
      } else {
        set({ phase: 'playerTurn', _activeSeat: 0, _activeHand: 0 })
        scheduleTick(TURN_MS)
      }
    },

    startDrillSession: () => {
      clearTick()
      const st = settings()
      const queue = buildDrillQueue({
        decks: st.decks,
        surrenderEnabled: st.surrenderEnabled,
        das: st.dasEnabled,
        ruleset: st.ruleset,
        deviationRange: devRange(),
        includeFalseSpots: st.drillFalseSpots,
        // Fresh seed per session so the false-spot shuffle differs each time;
        // the engine itself stays a pure function of its options.
        shuffleSeed: Date.now(),
      })
      set({
        mode: 'drill',
        sessionActive: true,
        mistakes: [],
        decisionsCount: 0,
        _seq: 0,
        _drillQueue: queue,
        _drillIndex: 0,
        botAction: null,
      })
      loadDrill(0)
    },

    nextDrill: () => {
      if (get().mode !== 'drill') return
      loadDrill(get()._drillIndex + 1)
    },

    startTcDrillSession: () => {
      clearTick()
      const st = settings()
      const queue = buildTcDrillQueue({
        decks: st.decks,
        surrenderEnabled: st.surrenderEnabled,
        das: st.dasEnabled,
        ruleset: st.ruleset,
        deviationRange: devRange(),
        // Fresh seed per session so decoy picks + shuffle differ each time;
        // the engine itself stays a pure function of its options.
        shuffleSeed: Date.now(),
      })
      set({
        mode: 'tcdrill',
        sessionActive: true,
        mistakes: [],
        decisionsCount: 0,
        _seq: 0,
        _tcDrillQueue: queue,
        _tcDrillIndex: 0,
        botAction: null,
      })
      loadTcDrill(0)
    },

    answerTcDrill: (answer: TcDrillAnswer) => {
      const g = get()
      if (g.mode !== 'tcdrill') return
      const sc = g.tcDrill
      if (!sc || g._tcDrillAnswered) return

      const isReal = sc.deviationIndex != null && sc.deviationAction != null
      // A real spot needs the exact boundary TC AND the deviation action; a
      // decoy is answered correctly by claiming no deviation exists.
      const wasCorrect = isReal
        ? answer.deviation &&
          answer.tc === sc.deviationIndex &&
          answer.action === sc.deviationAction
        : !answer.deviation

      const cmp = sc.comparator === 'lte' ? '<=' : '>='
      const chosen = answer.deviation
        ? `${answer.action ?? '?'} at TC ${fmtTc(answer.tc ?? 0)}`
        : 'no deviation'
      const correct = isReal
        ? `${sc.deviationAction} at TC ${cmp} ${fmtTc(sc.deviationIndex!)}`
        : 'no deviation'

      let mistakes = g.mistakes
      if (!wasCorrect) {
        const rec: MistakeRecord = {
          id: `m${g._seq}`,
          mode: 'tcdrill',
          playerCards: [...sc.playerCards],
          dealerUpcard: sc.dealerUpcard,
          // No live count in this mode; carry the boundary index (0 for
          // decoys) so the record stays well-formed. The Summary screen hides
          // the TC chip for tcdrill records.
          trueCount: sc.deviationIndex ?? 0,
          runningCount: 0,
          chosen,
          correct,
          isDeviation: isReal,
          reason: sc.reason,
          seq: g._seq,
        }
        mistakes = [...mistakes, rec]
      }
      useStats
        .getState()
        .recordSpotDecision([...sc.playerCards], sc.dealerUpcard, wasCorrect)
      set({
        decisionsCount: g.decisionsCount + 1,
        mistakes,
        _seq: g._seq + 1,
        _tcDrillAnswered: true,
        phase: 'roundOver',
        legalActions: [],
      })
    },

    nextTcDrill: () => {
      if (get().mode !== 'tcdrill') return
      loadTcDrill(get()._tcDrillIndex + 1)
    },

    revealHint: () => {
      const g = get()
      if (g.mode === 'drill') {
        if (g.drill) set({ hint: g.drill.correct })
        return
      }
      if (g.phase !== 'playerTurn') return
      const seat = g.seats[g._activeSeat]
      const hand = seat?.hands[g._activeHand]
      if (!seat || !seat.isHuman || !hand || hand.isDone) return
      set({ hint: getCorrectPlay(ctxFor(hand, seat)) })
    },

    endSession: () => {
      clearTick()
      set({ sessionActive: false, botAction: null })
    },

    resetSession: () => {
      clearTick()
      set({
        phase: 'idle',
        seats: [],
        dealer: emptyDealer(),
        mistakes: [],
        decisionsCount: 0,
        hint: null,
        legalActions: [],
        sessionActive: false,
        botAction: null,
        drill: null,
        tcDrill: null,
        insuranceTaken: null,
        insuranceNet: 0,
        _activeSeat: 0,
        _activeHand: 0,
        _seq: 0,
        _drillQueue: [],
        _drillIndex: 0,
        _drillAnswered: false,
        _tcDrillQueue: [],
        _tcDrillIndex: 0,
        _tcDrillAnswered: false,
      })
    },

    // Called once on startup: a session persisted mid-animation (deal, bot
    // turn, dealer draw-out) has no live timer after a relaunch, so restart
    // the machine unless it is legitimately waiting on human input.
    _kick: () => {
      const g = get()
      if (!g.sessionActive) return
      if (g.mode === 'drill') {
        // Killed after answering but before Next: the decision was already
        // recorded, so re-presenting the spot would record it twice — advance
        // to the next one instead.
        if (g._drillAnswered) get().nextDrill()
        return
      }
      if (g.mode === 'tcdrill') {
        // Same double-count hazard as the deviation drill.
        if (g._tcDrillAnswered) get().nextTcDrill()
        return
      }
      if (g.phase === 'dealing' || g.phase === 'dealerTurn') {
        scheduleTick(TURN_MS)
        return
      }
      if (g.phase === 'playerTurn') {
        const seat = g.seats[g._activeSeat]
        const hand = seat?.hands[g._activeHand]
        // "Waiting on the human" is only true once turnStep actually handed
        // over (active flag + legal actions committed atomically). A kill in
        // the dealing->playerTurn tick gap persists the pointer WITHOUT them;
        // treating that as waiting would soft-lock the round, so re-kick —
        // turnStep is idempotent for a hand already presented.
        const waitingOnHuman =
          !!seat &&
          seat.isHuman &&
          !!hand &&
          !hand.isDone &&
          hand.isActive &&
          g.legalActions.length > 0
        if (!waitingOnHuman) scheduleTick(TURN_MS)
      }
    },
  }
}, {
  name: 'bj-trainer-session',
  version: 1,
  // Persist only the serializable session state (no methods); the Shoe class
  // instance is snapshotted to a plain object. botAction is deliberately
  // dropped: _kick() re-announces a bot decision after a relaunch.
  partialize: (state) => ({
    mode: state.mode,
    phase: state.phase,
    count: state.count,
    displayTrueCount: state.displayTrueCount,
    seats: state.seats,
    dealer: state.dealer,
    humanSeatIndex: state.humanSeatIndex,
    mistakes: state.mistakes,
    decisionsCount: state.decisionsCount,
    hint: state.hint,
    legalActions: state.legalActions,
    sessionActive: state.sessionActive,
    drill: state.drill,
    tcDrill: state.tcDrill,
    insuranceTaken: state.insuranceTaken,
    insuranceNet: state.insuranceNet,
    _shoe: snapshotShoe(state._shoe),
    _activeSeat: state._activeSeat,
    _activeHand: state._activeHand,
    _seq: state._seq,
    _drillQueue: state._drillQueue,
    _drillIndex: state._drillIndex,
    _drillAnswered: state._drillAnswered,
    _tcDrillQueue: state._tcDrillQueue,
    _tcDrillIndex: state._tcDrillIndex,
    _tcDrillAnswered: state._tcDrillAnswered,
  }),
  // _shoe rehydrates as a plain snapshot; rebuild the class instance so
  // draw()/decksRemaining/shouldReshuffle keep working after a relaunch.
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<GameInternal> & {
      _shoe?: ShoeSnapshot | null
    }
    const merged = { ...current, ...p, _shoe: restoreShoe(p._shoe), botAction: null }
    // A drill killed between answering and tapping Next rehydrates with
    // _drillAnswered stuck true. Do NOT re-present the spot as unanswered —
    // the decision was already recorded and answering again would double-count
    // it. The startup _kick() advances to the next spot instead.
    return merged
  },
}))

// Restart a round that was persisted mid-animation (iOS kills suspended PWAs;
// the tick timer does not survive a relaunch). Deferred a beat so rehydration
// and first paint settle before cards start moving again.
if (IS_BROWSER) {
  window.setTimeout(() => useGame.getState()._kick(), 350)
}
