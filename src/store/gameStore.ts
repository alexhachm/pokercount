import { create } from 'zustand'
import {
  type Action,
  type Card,
  type CountState,
  type DealerView,
  type DrillScenario,
  type GameMode,
  type GameStore,
  type HandOutcome,
  type MistakeRecord,
  type PlayerHandView,
  type RoundPhase,
  type SeatView,
  type StrategyContext,
  type StrategyDecision,
} from '@/types'
import { Shoe } from '@/engine/shoe'
import { evaluate, isBlackjack } from '@/engine/hand'
import { hiLoTag, trueCount as computeTrueCount } from '@/engine/count'
import { playDealerOut } from '@/engine/dealer'
import { getCorrectPlay } from '@/engine/strategy'
import { botDecision } from '@/engine/bots'
import { buildDrillQueue } from '@/engine/drillEngine'
import { useSettings } from '@/store/settingsStore'

// Internal store shape extends the public contract with private bookkeeping.
interface GameInternal extends GameStore {
  _shoe: Shoe | null
  _activeSeat: number
  _activeHand: number
  _seq: number
  _drillQueue: DrillScenario[]
  _drillIndex: number
  _drillAnswered: boolean
}

const tagSum = (cards: Card[]) => cards.reduce((s, c) => s + hiLoTag(c), 0)

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
export const useGame = create<GameInternal>((set, get) => {
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

  const commit = (seats: SeatView[]) => set({ seats })

  /** The active deviation-range limit, or null when the limit is off. */
  const devRange = (): { min: number; max: number } | null => {
    const st = settings()
    return st.deviationRangeEnabled
      ? { min: st.deviationRangeMin, max: st.deviationRangeMax }
      : null
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
      // Bots can now split too (up to 4 hands per box); aces only get one card.
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

  const playBotHand = (seats: SeatView[], seat: SeatView, hand: PlayerHandView) => {
    const shoe = get()._shoe!
    // Bots: hit/stand/double/surrender (no splits in v1).
    let guard = 0
    while (!hand.isDone && guard++ < 12) {
      refreshValue(hand)
      if (hand.value.isBust || hand.value.isBlackjack) {
        hand.isDone = true
        break
      }
      const action = botDecision(ctxFor(hand, seat, true))
      if (action === 'stand' || action === 'split') {
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
      } else {
        // hit
        const c = shoe.draw()
        hand.cards.push(c)
        reveal([c])
        refreshValue(hand)
      }
    }
    hand.isDone = true
  }

  /** Advance through seats/hands, auto-playing bots, until a human must act
   *  or all hands are resolved (then run the dealer + settle). */
  const advance = () => {
    const seats = cloneSeats(get().seats)
    let si = get()._activeSeat
    let hi = get()._activeHand

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (si >= seats.length) {
        setActiveFlags(seats, -1, -1)
        set({ seats, _activeSeat: si, _activeHand: hi })
        dealerPhase()
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
      if (seat.isHuman) {
        setActiveFlags(seats, si, hi)
        set({
          seats,
          _activeSeat: si,
          _activeHand: hi,
          phase: 'playerTurn',
          legalActions: legalFor(hand, seat),
          hint: null,
        })
        return
      }
      // bot — count-aware auto-play, including splits
      const botAction = botDecision(ctxFor(hand, seat, true))
      if (botAction === 'split') {
        splitHand(seat, hi, hand)
        // Re-process from the same index: the first split hand now sits at hi
        // and may itself draw, split again, or stand.
        continue
      }
      playBotHand(seats, seat, hand)
      hi += 1
    }
  }

  const dealerPhase = () => {
    const shoe = get()._shoe!
    const dealer: DealerView = { ...get().dealer, cards: [...get().dealer.cards] }
    // reveal hole
    dealer.holeRevealed = true
    set({ phase: 'dealerTurn' })
    if (dealer.cards[1]) reveal([dealer.cards[1]])

    const seats = get().seats
    const anyLive = seats.some((s) =>
      s.hands.some((h) => {
        const v = evaluate(h.cards)
        return !h.isSurrendered && !v.isBust
      }),
    )
    if (anyLive && !isBlackjack(dealer.cards)) {
      const before = dealer.cards.length
      const full = playDealerOut(dealer.cards, () => shoe.draw(), settings().ruleset)
      dealer.cards = full
      const drawn = full.slice(before)
      if (drawn.length) reveal(drawn)
    }
    dealer.value = evaluate(dealer.cards)
    set({ dealer })
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
    set({ seats, phase: 'roundOver', legalActions: [] })
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

    // advance pointer if the current hand is finished
    set({ seats })
    if (action !== 'split') {
      const finished = seats[si].hands[hi].isDone
      if (finished) {
        set({ _activeHand: hi + 1 })
      }
    }
    advance()
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
    drill: null,

    _shoe: null,
    _activeSeat: 0,
    _activeHand: 0,
    _seq: 0,
    _drillQueue: [],
    _drillIndex: 0,
    _drillAnswered: false,

    startPlayRound: () => {
      const st = settings()
      const newSession = !get().sessionActive
      if (newSession) {
        set({ mistakes: [], decisionsCount: 0, _seq: 0, _shoe: null })
      }
      let shoe = get()._shoe
      let running = get().count.running
      if (!shoe || shoe.decks !== st.decks || shoe.shouldReshuffle(st.penetration)) {
        shoe = new Shoe(st.decks)
        running = 0
      }

      // Build seats in deal order (seat 0 dealt first). The human sits at the
      // chosen position; bots fill the remaining seats. The sentinel default
      // clamps to the last seat (third base), preserving the classic layout.
      // Clamp counts to the supported caps so a stale/over-cap persisted value
      // can never breach the "7 seats total" invariant.
      const numHands = Math.min(5, Math.max(1, st.numHands))
      const numOtherPlayers = Math.min(6, Math.max(0, st.numOtherPlayers))
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

      // deal two rounds
      const dealer: DealerView = emptyDealer()
      const revealed: Card[] = []
      for (let pass = 0; pass < 2; pass++) {
        for (const seat of seats) {
          for (const hand of seat.hands) {
            const c = shoe.draw()
            hand.cards.push(c)
            revealed.push(c)
          }
        }
        const dc = shoe.draw()
        dealer.cards.push(dc)
        if (pass === 0) {
          dealer.upcard = dc
          revealed.push(dc) // upcard face up
        }
        // hole (pass===1) stays hidden
      }
      seats.forEach((s) => s.hands.forEach(refreshValue))
      dealer.value = evaluate(dealer.cards)

      // commit base state + count for revealed (upcard + all player cards)
      set({
        mode: 'play',
        sessionActive: true,
        _shoe: shoe,
        seats,
        dealer,
        humanSeatIndex: humanIndex,
        _activeSeat: 0,
        _activeHand: 0,
        hint: null,
        // mistakes/decisions persist across rounds within a session; reset on new session via resetSession
      })
      setCount(running + tagSum(revealed), shoe.decksRemaining)

      // dealer peek on 10/A
      const up = dealer.upcard as Card
      const peeks = up.rank === 'A' || evaluate([up]).total === 10
      if (peeks && isBlackjack(dealer.cards)) {
        const d2 = { ...get().dealer, holeRevealed: true }
        reveal([d2.cards[1]])
        set({ dealer: d2 })
        settle()
        return
      }
      advance()
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
      const hand = seat.hands[get()._activeHand]
      // record correctness BEFORE mutating
      const correct = getCorrectPlay(ctxFor(hand, seat))
      recordDecision(hand, seat, action, correct, 'play')
      applyHumanAction(action)
    },

    startDrillSession: () => {
      const st = settings()
      const queue = buildDrillQueue({
        decks: st.decks,
        surrenderEnabled: st.surrenderEnabled,
        das: st.dasEnabled,
        ruleset: st.ruleset,
        deviationRange: devRange(),
      })
      set({
        mode: 'drill',
        sessionActive: true,
        mistakes: [],
        decisionsCount: 0,
        _seq: 0,
        _drillQueue: queue,
        _drillIndex: 0,
      })
      loadDrill(0)
    },

    nextDrill: () => {
      if (get().mode !== 'drill') return
      loadDrill(get()._drillIndex + 1)
    },

    revealHint: () => {
      const g = get()
      if (g.mode === 'drill') {
        if (g.drill) set({ hint: g.drill.correct })
        return
      }
      if (g.phase !== 'playerTurn') return
      const seat = g.seats[g._activeSeat]
      const hand = seat.hands[g._activeHand]
      set({ hint: getCorrectPlay(ctxFor(hand, seat)) })
    },

    endSession: () => {
      set({ sessionActive: false })
    },

    resetSession: () => {
      set({
        phase: 'idle',
        seats: [],
        dealer: emptyDealer(),
        mistakes: [],
        decisionsCount: 0,
        hint: null,
        legalActions: [],
        sessionActive: false,
        drill: null,
        _activeSeat: 0,
        _activeHand: 0,
        _seq: 0,
        _drillQueue: [],
        _drillIndex: 0,
        _drillAnswered: false,
      })
    },
  }
})
