// Headless runtime test of the gameStore state machine (no DOM needed).
// Polyfill a localStorage so zustand/persist (settingsStore) is happy in Node.
const mem: Record<string, string> = {}
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = v
  },
  removeItem: (k: string) => {
    delete mem[k]
  },
  clear: () => {
    for (const k of Object.keys(mem)) delete mem[k]
  },
  key: () => null,
  length: 0,
} as unknown as Storage

const { useGame } = await import('@/store/gameStore')
const { useSettings } = await import('@/store/settingsStore')

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) pass++
  else {
    fail++
    console.log(`FAIL: ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`)
  }
}

const S = () => useGame.getState()

// --- configure settings ---
useSettings.setState({
  decks: 6,
  numOtherPlayers: 2,
  numHands: 2,
  surrenderEnabled: true,
  dasEnabled: true,
  showRunningCount: true,
  showTrueCount: true,
})

// With an Ace up the deal parks on the insurance offer; decline it so the
// generic round-driving assertions below see playerTurn/roundOver as before.
const declineInsurance = () => {
  if (S().phase === 'insurance') S().takeInsurance(false)
}

// =================== PLAY MODE ===================
S().resetSession()
S().startPlayRound()
declineInsurance()
ok('play: 3 seats (2 bots + human)', S().seats.length === 3, S().seats.length)
const human = S().seats[S().humanSeatIndex]
ok('play: human is last seat', S().humanSeatIndex === 2, S().humanSeatIndex)
ok('play: human has 2 hands', human.hands.length === 2, human.hands.length)
ok('play: dealer has 2 cards', S().dealer.cards.length === 2, S().dealer.cards.length)
ok('play: dealer upcard set', S().dealer.upcard !== null)
ok('play: hole hidden initially or round ended', S().dealer.holeRevealed === (S().phase === 'roundOver'))
ok('play: phase is playerTurn or roundOver', ['playerTurn', 'roundOver'].includes(S().phase), S().phase)

// drive the human turns by standing on everything
let guard = 0
while (S().phase === 'playerTurn' && guard++ < 30) {
  const legal = S().legalActions
  ok('play: legalActions non-empty during turn', legal.length > 0, legal)
  // never bust the test: just stand
  S().act('stand')
}
ok('play: round resolves to roundOver', S().phase === 'roundOver', S().phase)
const allSettled = S().seats.every((s) => s.hands.every((h) => h.outcome !== 'pending'))
ok('play: all hands settled', allSettled)
ok('play: dealer hole revealed at end', S().dealer.holeRevealed)
ok('play: running count is a number', Number.isFinite(S().count.running), S().count.running)
ok('play: decksRemaining < 6 after dealing', S().count.decksRemaining < 6, S().count.decksRemaining)

// next round keeps the session (mistakes persist)
const decisionsAfterR1 = S().decisionsCount
S().startPlayRound()
declineInsurance()
ok('play: next round keeps session active', S().sessionActive === true)
ok('play: decisions carried over', S().decisionsCount >= decisionsAfterR1, S().decisionsCount)
// finish round 2
guard = 0
while (S().phase === 'playerTurn' && guard++ < 30) S().act('stand')
ok('play: round 2 resolves', S().phase === 'roundOver', S().phase)

S().endSession()
ok('play: endSession clears sessionActive', S().sessionActive === false)

// =================== DRILL MODE ===================
S().resetSession()
S().startDrillSession()
ok('drill: drill scenario loaded', S().drill !== null)
ok('drill: mode is drill', S().mode === 'drill')
ok('drill: phase playerTurn', S().phase === 'playerTurn', S().phase)
ok('drill: count preset matches scenario', S().count.trueCount === S().drill!.trueCount)
ok('drill: legalActions present', S().legalActions.length > 0)

// deliberately make a WRONG move to test mistake recording
const correct = S().drill!.correct.action
const wrong = correct === 'stand' ? 'hit' : 'stand'
S().act(wrong)
ok('drill: mistake recorded', S().mistakes.length === 1, S().mistakes.length)
ok('drill: decisionsCount incremented', S().decisionsCount === 1, S().decisionsCount)
ok('drill: hint set to correct after answer', S().hint?.action === correct, S().hint?.action)
ok('drill: phase roundOver after answer', S().phase === 'roundOver', S().phase)
const firstId = S().drill!.id

// advance
S().nextDrill()
ok('drill: advanced to next scenario', S().drill !== null && S().drill!.id !== firstId)
ok('drill: phase back to playerTurn', S().phase === 'playerTurn', S().phase)

// make a CORRECT move -> no new mistake
const correct2 = S().drill!.correct.action
S().act(correct2)
ok('drill: correct move adds no mistake', S().mistakes.length === 1, S().mistakes.length)
ok('drill: decisionsCount now 2', S().decisionsCount === 2, S().decisionsCount)

// =================== SEAT POSITION ===================
S().resetSession()
useSettings.setState({ numOtherPlayers: 3, numHands: 1, humanSeatPosition: 0, decks: 6 })
S().startPlayRound()
ok('seat: human at chosen first seat', S().humanSeatIndex === 0 && S().seats[0].isHuman, S().humanSeatIndex)
ok('seat: 4 seats total (3 bots + you)', S().seats.length === 4, S().seats.length)

S().resetSession()
useSettings.setState({ humanSeatPosition: 2 })
S().startPlayRound()
ok('seat: human at chosen middle seat', S().humanSeatIndex === 2 && S().seats[2].isHuman, S().humanSeatIndex)

// sentinel default clamps to the last seat
S().resetSession()
useSettings.setState({ humanSeatPosition: 99 })
S().startPlayRound()
ok('seat: sentinel clamps human to last seat', S().humanSeatIndex === 3 && S().seats[3].isHuman, S().humanSeatIndex)

// =================== BOT SPLITTING ===================
// Seed Math.random so the shoe (and thus pair frequency) is deterministic; then
// verify the new bot-split path never wedges the state machine and that a bot
// does in fact split across a run of rounds.
S().resetSession()
// 6 decks keeps a single heavy-split round from exhausting the shoe mid-deal.
useSettings.setState({ numOtherPlayers: 6, numHands: 1, humanSeatPosition: 0, decks: 6, surrenderEnabled: false })
const _origRandom = Math.random
let _seed = 987654321
Math.random = () => {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff
  return _seed / 0x7fffffff
}
let sawBotSplit = false
let resolvedAll = true
let countAlwaysFinite = true
for (let r = 0; r < 80; r++) {
  S().startPlayRound()
  declineInsurance()
  let g = 0
  while (S().phase === 'playerTurn' && g++ < 60) S().act('stand')
  if (S().phase !== 'roundOver') resolvedAll = false
  if (!Number.isFinite(S().count.running) || !Number.isFinite(S().count.trueCount)) countAlwaysFinite = false
  for (const seat of S().seats) {
    if (!seat.isHuman && seat.hands.length > 1) sawBotSplit = true
  }
}
Math.random = _origRandom
ok('botsplit: every round resolved to roundOver', resolvedAll)
ok('botsplit: count stayed finite throughout', countAlwaysFinite)
ok('botsplit: a bot split at least once', sawBotSplit)

// =================== PER-BOX SPLIT CAP ===================
// With numHands=4 the seat already holds 4 boxes; the resplit cap must be
// counted per box, so a pair on any box is still splittable (regression test
// for the seat-wide `hands.length < 4` bug).
S().resetSession()
useSettings.setState({ numOtherPlayers: 0, numHands: 4, humanSeatPosition: 99, decks: 6, surrenderEnabled: false })
const _origRandom2 = Math.random
let _seed2 = 24681012
Math.random = () => {
  _seed2 = (_seed2 * 1103515245 + 12345) & 0x7fffffff
  return _seed2 / 0x7fffffff
}
let sawPairBox = false
let pairAlwaysSplittable = true
for (let r = 0; r < 60; r++) {
  S().startPlayRound()
  declineInsurance()
  let g = 0
  while (S().phase === 'playerTurn' && g++ < 60) {
    const hseat = S().seats[S().humanSeatIndex]
    const active = hseat.hands.find((h) => h.isActive)
    if (active && active.cards.length === 2 && active.value.isPair) {
      sawPairBox = true
      if (!S().legalActions.includes('split')) pairAlwaysSplittable = false
    }
    S().act('stand')
  }
}
Math.random = _origRandom2
ok('perbox: saw a pair on a box with numHands=4', sawPairBox)
ok('perbox: pair on a box is always splittable (per-box cap)', pairAlwaysSplittable)

// =================== INSURANCE ===================
// An Ace up must park the round in the insurance phase before the peek. Answer
// deliberately WRONG each time to exercise grading, mistake recording, and the
// side-bet settlement in one pass.
S().resetSession()
useSettings.setState({
  numOtherPlayers: 0,
  numHands: 1,
  humanSeatPosition: 99,
  decks: 6,
  surrenderEnabled: false,
  deviationRangeEnabled: false,
})
const _origRandom3 = Math.random
let _seed3 = 1357911
Math.random = () => {
  _seed3 = (_seed3 * 1103515245 + 12345) & 0x7fffffff
  return _seed3 / 0x7fffffff
}
let insOffers = 0
let insAceUp = true
let insRoundsResolve = true
let insGradeOk = true
let insNetOk = true
for (let r = 0; r < 150 && insOffers < 5; r++) {
  S().startPlayRound()
  if (S().phase === 'insurance') {
    insOffers++
    if (S().dealer.upcard?.rank !== 'A') insAceUp = false
    const decisionsBefore = S().decisionsCount
    const mistakesBefore = S().mistakes.length
    const shouldTake = S().count.trueCount >= 3
    S().takeInsurance(!shouldTake) // wrong on purpose
    if (S().decisionsCount !== decisionsBefore + 1) insGradeOk = false
    if (S().mistakes.length !== mistakesBefore + 1) insGradeOk = false
    if (!shouldTake) {
      // We took it against the count: one box pays +1 on dealer BJ, else -0.5.
      const n = S().insuranceNet
      if (n !== 1 && n !== -0.5) insNetOk = false
    }
  }
  let g = 0
  while (S().phase === 'playerTurn' && g++ < 60) S().act('stand')
  if (S().phase !== 'roundOver') insRoundsResolve = false
}
Math.random = _origRandom3
ok('insurance: offered at least once across the run', insOffers >= 1, insOffers)
ok('insurance: only offered with an ace up', insAceUp)
ok('insurance: rounds still resolve to roundOver', insRoundsResolve)
ok('insurance: graded as a decision (mistake on wrong answer)', insGradeOk)
ok('insurance: side bet settles to +1 or -0.5 per box', insNetOk)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
