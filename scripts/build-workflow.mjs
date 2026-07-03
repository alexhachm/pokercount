export const meta = {
  name: 'bj-trainer-build',
  description: 'Build the Blackjack Trainer engine + UI in parallel against a fixed type contract',
  phases: [
    { title: 'Engine primitives', detail: 'cards/shoe, hand, count, dealer' },
    { title: 'Strategy tables', detail: 'basic strategy + deviations: author → adversarial verify → fix' },
    { title: 'Resolver & drill', detail: 'strategy resolver + bots + drill scenario generator' },
    { title: 'UI components', detail: 'table + control components' },
    { title: 'Screens', detail: 'home, settings, play, drill, summary' },
    { title: 'Integration review', detail: 'read all files, report signature/contract mismatches' },
  ],
}

const ROOT = String.raw`C:\Users\Owner\desktop\pokercount`
const TYPES = ROOT + String.raw`\src\types\index.ts`

const COMMON = `
You are implementing ONE part of a React + TypeScript (Vite) Blackjack trainer PWA.

HARD RULES:
- FIRST, Read ${TYPES} in full. It is the shared contract. Import all shared types from '@/types'.
- Write ONLY the file(s) explicitly assigned to you, using the Write tool with the given ABSOLUTE path(s).
- Do NOT create, edit, delete, or touch ANY other file. Do NOT run npm, tsc, vite, or any build/test command. Do NOT add dependencies.
- Code style: TypeScript ESM, modern, functional, no classes unless specified, no comments-bloat but explain non-obvious logic. Strict mode is on (no implicit any, handle nulls).
- The '@/...' import alias maps to 'src/...'. Use it (e.g. import { evaluate } from '@/engine/hand').
- Your final message is the RETURN VALUE (not shown to a human). Return a 1-3 sentence summary of what you wrote and any assumptions.
`

// Exact engine module API every engine agent must conform to.
const ENGINE_API = `
ENGINE MODULE API CONTRACT (every engine module must match these exact export signatures so the modules integrate):

// src/engine/cards.ts
export function buildShoe(decks: number): Card[]   // decks*52 fresh ordered cards; ids unique & stable, e.g. \`\${d}-\${rank}\${suit}\`
export function shuffle<T>(arr: T[], rng?: () => number): T[]   // pure Fisher-Yates returning a NEW array; default rng = Math.random

// src/engine/shoe.ts  (class)
export class Shoe {
  constructor(decks: number, rng?: () => number)   // builds + shuffles immediately
  readonly decks: number
  draw(): Card                  // remove & return next card; throw if empty
  get remaining(): number
  get dealt(): number           // cards drawn since last reset
  get decksRemaining(): number  // remaining / 52
  shouldReshuffle(penetration: number): boolean  // dealt / (decks*52) >= penetration
  reset(): void                 // rebuild + shuffle, dealt = 0
  stackNext(cards: Card[]): void // force the next draws to be exactly these, cards[0] drawn first (used by drill mode)
}

// src/engine/hand.ts
export function evaluate(cards: Card[]): HandValue
  // total = best <=21 if possible else minimal; soft = an ace counts as 11; isBlackjack only when exactly 2 cards summing to 21;
  // isBust = total>21; isPair = exactly 2 cards of EQUAL BLACKJACK VALUE (so 10-J-Q-K all pair together), pairRank = first card's rank.
export function isBlackjack(cards: Card[]): boolean

// src/engine/count.ts
export function hiLoTag(card: Card): number               // from HILO_VALUE
export function runningCountOf(cards: Card[]): number
export function trueCount(running: number, decksRemaining: number): number  // running / Math.max(decksRemaining, 1e-6) (exact, no rounding)
export function computeCount(revealedCards: Card[], decksRemaining: number): CountState

// src/engine/basicStrategy.ts
export function basicStrategyAction(
  playerCards: Card[], dealerUpcard: Card,
  opts: { canDouble: boolean; canSplit: boolean; canSurrender: boolean; das: boolean; ruleset: Ruleset }
): { action: Action; reason: string }

// src/engine/deviations.ts
export const INDEX_PLAYS: IndexPlay[]
export function findIndexPlay(kind: HandKind, params: { total?: number; pairRank?: Rank; upcard?: UpcardValue }): IndexPlay | undefined
export function shouldDeviate(play: IndexPlay, trueCount: number): boolean   // gte: tc>=index ; lte: tc<=index

// src/engine/dealer.ts
export function dealerShouldHit(value: HandValue, ruleset: Ruleset): boolean  // S17 stands on all 17 (incl soft 17); hits <17
export function playDealerOut(holeCards: Card[], draw: () => Card, ruleset: Ruleset): Card[]

// src/engine/strategy.ts
export function getCorrectPlay(ctx: StrategyContext): StrategyDecision
  // 1) basic = basicStrategyAction. 2) classify hand (pair/soft/hard + total). 3) play = findIndexPlay(...).
  // If play exists AND shouldDeviate(play, ctx.trueCount) AND deviation action is legal
  //   (surrender->canSurrender, double->canDouble, split->canSplit), then action = play.action else action = basic.action.
  // isDeviation = action !== basic.action. basicAction = basic.action. reason explains (e.g. "16 v 10: stand at TC >= 0").

// src/engine/bots.ts
export function botDecision(ctx: StrategyContext): Action   // = getCorrectPlay(ctx).action

// src/engine/drillEngine.ts
export function buildDrillQueue(opts: { decks: number; surrenderEnabled: boolean; das: boolean; ruleset: Ruleset }): DrillScenario[]
`

// Exact UI component prop contracts.
const UI_CONTRACT = `
UI COMPONENT API CONTRACT (components are consumed by the screens; match these exact default-export prop shapes):

// src/components/PlayingCard.tsx  (NOTE filename: PlayingCard.tsx, default export)
export interface PlayingCardProps { card?: Card | null; faceDown?: boolean; size?: 'sm' | 'md' }
// Renders one card. faceDown -> patterned back. Hearts/Diamonds red, Spades/Clubs black. Rounded white card.

// src/components/HandView.tsx
export interface HandViewProps { hand: PlayerHandView; label?: string; compact?: boolean }
// Row of PlayingCard + a total badge (e.g. "17" or "soft 18" or "BJ"); show DOUBLE/SURR/BUST/outcome chips; ring/glow when hand.isActive.

// src/components/DealerArea.tsx
export interface DealerAreaProps { dealer: DealerView }
// Dealer label + cards; hole card faceDown until dealer.holeRevealed; show total once revealed.

// src/components/ActionBar.tsx
export interface ActionBarProps { legal: Action[]; onAction: (a: Action) => void; disabled?: boolean }
// Large touch buttons for ONLY the actions present in legal, order: Surrender, Split, Double, Hit, Stand. Color-coded. Full-width row, big tap targets.

// src/components/CountDisplay.tsx
export interface CountDisplayProps { running: number; trueCount: number; showRunning: boolean; showTrue: boolean }
// Small pill(s). Render null if neither flag set. Show RC and/or TC (TC formatted to 1 decimal). tabular-nums.

// src/components/ShoeIndicator.tsx
export interface ShoeIndicatorProps { decks: number; decksRemaining: number }
// "6D" label + a small horizontal bar showing fraction remaining + "≈4.5 left".

// src/components/HintBanner.tsx
export interface HintBannerProps { hint: StrategyDecision | null; canShow: boolean; revealed: boolean; onShow: () => void }
// If canShow && !revealed -> a "Show correct move" button. If revealed && hint -> show hint.action (big) + hint.reason + a "DEVIATION" tag when hint.isDeviation.

STORE HOOKS available to screens:
  import { useGame } from '@/store/gameStore'      // returns the GameStore interface from '@/types'
  import { useSettings } from '@/store/settingsStore'  // returns SettingsStore (Settings fields + set(key,value) + reset())
  import { useUi } from '@/store/uiStore'          // { screen, go(screen) }
Note: useGame / gameStore is implemented separately; rely ONLY on the GameStore interface in '@/types'. Use selector form, e.g. const phase = useGame(s => s.phase).
`

// ---------------------------------------------------------------------------
// Phase 1 — engine primitives (parallel)
// ---------------------------------------------------------------------------
phase('Engine primitives')
const primitives = await parallel([
  () => agent(
    `${COMMON}\n${ENGINE_API}\nTASK: Implement card model + shoe.\nWrite TWO files:\n- ${ROOT}\\src\\engine\\cards.ts  (buildShoe, shuffle, plus any small helpers like RANKS/SUITS arrays you export)\n- ${ROOT}\\src\\engine\\shoe.ts   (the Shoe class)\nNotes: stackNext must guarantee cards[0] is the very next draw. draw() should be O(1). Keep a private array; you choose whether top is front or back but be consistent and document it.`,
    { label: 'cards+shoe', phase: 'Engine primitives' },
  ),
  () => agent(
    `${COMMON}\n${ENGINE_API}\nTASK: Implement hand evaluation.\nWrite ONE file: ${ROOT}\\src\\engine\\hand.ts\nImplement evaluate() and isBlackjack() exactly per the contract. Handle multiple aces correctly (only one ace can be 11). isPair requires exactly 2 cards of equal blackjack value.`,
    { label: 'hand', phase: 'Engine primitives' },
  ),
  () => agent(
    `${COMMON}\n${ENGINE_API}\nTASK: Implement Hi-Lo counting.\nWrite ONE file: ${ROOT}\\src\\engine\\count.ts\nImplement hiLoTag, runningCountOf, trueCount, computeCount per contract. trueCount must not divide by zero.`,
    { label: 'count', phase: 'Engine primitives' },
  ),
  () => agent(
    `${COMMON}\n${ENGINE_API}\nTASK: Implement dealer play.\nWrite ONE file: ${ROOT}\\src\\engine\\dealer.ts\nimport { evaluate } from '@/engine/hand'. dealerShouldHit: S17 stands on ALL 17 including soft 17; hits anything < 17. playDealerOut draws until standing/bust and returns the full hand array (including the original hole cards).`,
    { label: 'dealer', phase: 'Engine primitives' },
  ),
])

// ---------------------------------------------------------------------------
// Phase 2 — strategy tables: author -> adversarial verify -> fix
// ---------------------------------------------------------------------------
phase('Strategy tables')

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['errorCount', 'errors', 'assessment'],
  properties: {
    errorCount: { type: 'integer' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cell', 'found', 'expected', 'note'],
        properties: {
          cell: { type: 'string', description: 'e.g. "hard 16 vs 10" or "A,7 vs 9" or "8,8 vs 10"' },
          found: { type: 'string' },
          expected: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    assessment: { type: 'string' },
  },
}

const tableSpecs = [
  {
    key: 'basicStrategy',
    file: ROOT + String.raw`\src\engine\basicStrategy.ts`,
    authorTask: `TASK: Implement the canonical 4–8 deck, dealer-stands-soft-17 (S17) basic strategy in basicStrategyAction().
Cover hard totals (5–21), soft totals (A,2 … A,9), and pairs (2,2 … A,A) vs dealer 2–A.
Use the standard multi-deck S17 chart with Double-After-Split. Respect legality via opts:
  - If chart says Double but !canDouble: hard -> Hit; soft -> the soft-total stand/hit (i.e. fall back to the "else" action: e.g. A,7 doubles vs 3-6 but stands otherwise -> if can't double, Stand for A,7, Hit for A,2-A,5 doubles).
  - If chart says Split but !canSplit (or pair already split past cap): play it as the equivalent hard/soft total.
  - If chart says Surrender but !canSurrender: fall back to Hit (or Stand where standard).
  - das flag: when das=false, 4,4 and 6,6 (and a couple others) change — implement DAS vs no-DAS pair splits correctly.
Return { action, reason } where reason is short e.g. "hard 16 vs 10 -> stand" or "A,7 vs 6 -> double".
Implement as clear data tables (string codes) + a resolver, not a giant if-chain. Add a comment block citing this is the multi-deck S17 DAS reference chart.`,
    verifyTask: `Adversarially verify the basic strategy in this file against the canonical 4–8 deck S17 (dealer stands soft 17) basic strategy chart with DAS. Check EVERY hard total (8–17 vs all upcards for the doubles & 12–16 stand/hit lines), EVERY soft total (A,2–A,9), and EVERY pair (2,2–A,A) vs 2–A. Pay special attention to known tricky cells: hard 11 vs A (double), hard 9 vs 2 (hit) and vs 3-6 (double), 12 vs 2/3 (hit) vs 4-6 (stand), A,7 (soft 18) vs 2 (stand) vs 3-6 (double) vs 7-8 (stand) vs 9-A (hit), A,8 vs 6, pairs 9,9 (split vs 2-9 except 7, stand vs 7/10/A), 8,8 always split, 4,4 (split vs 5-6 with DAS only), 6,6 (split vs 2-6, vs 2 only with DAS). Also verify legality fallbacks. Report each wrong cell.`,
  },
  {
    key: 'deviations',
    file: ROOT + String.raw`\src\engine\deviations.ts`,
    authorTask: `TASK: Build the Hi-Lo INDEX_PLAYS deviation table (the request is for a FULL index set, ~50+ entries) plus findIndexPlay() and shouldDeviate().
Include at minimum the Illustrious 18 and the Fab 4 surrenders, AND a fuller index set (additional commonly-published Hi-Lo indices) — aim for a comprehensive list.
Each IndexPlay: { id, kind, total?, pairRank?, upcard?, index, comparator, action, basicAction, description }.
Conventions:
  - Insurance: kind:'insurance', index 3, comparator 'gte', action 'stand' is N/A — instead set action to a sentinel? NO: insurance is special; include ONE entry id 'insurance' kind:'insurance' index:3 comparator:'gte' action:'stand' basicAction:'hit' description "Take insurance at TC >= +3" (the game layer interprets insurance separately; just include the data).
  - Most plays use comparator 'gte' (take the rich-deck action at/above the index). Use 'lte' only for the few plays where the deviation triggers as the count DROPS (e.g. 13 v 2/3 lower-bound stands, or 12 v 4 type lines are still gte — be careful; encode each one's true direction).
  - 'total' for hard/soft, 'pairRank' for pairs (e.g. '10' for 10,10 split deviations vs 4,5,6), 'upcard' 2..11.
KEY illustrious 18 (verify each index): Insurance +3; 16v10 >=0 stand (basic hit); 15v10 >=4 stand; 10,10 v5 >=5 split; 10,10 v6 >=4 split; 10v10(hard) >=4 double; 12v3 >=2 stand; 12v2 >=3 stand; 11vA >=1 double; 9v2 >=1 double; 10vA >=4 double; 9v7 >=3 double; 16v9 >=5 stand; 13v2 >=-1 stand; 12v4 >=0 stand; 12v5 >=-2 stand; 12v6 >=-1 stand; 13v3 >=-2 stand. Fab 4 surrenders: 14v10 >=3; 15v10 >=0; 15v9 >=2; 15vA >=1 (late surrender). Add more standard indices (e.g. 16v9 already; 8v6 double >=2; 8v5 double >=4; 9v2/9v7 above; soft 19 (A,8) v6 double >=1; soft 19 v5 double >=3; 10v9 double >=4; 13v2,13v3 above; 14v10 stand vs surrender — keep surrender; 12v4 etc.).
For the 'stand at >= -1' type lower-bound stands: these mean "stand when TC >= index" so comparator 'gte' with a negative index (below the index you HIT). Confirm: 13v2 stand at -1 means hit below -1 -> gte with index -1. Yes use gte.
findIndexPlay matches by kind + total/pairRank + upcard. shouldDeviate compares per comparator.
Add a citation comment that these are standard Hi-Lo indices (Illustrious 18 / Fab 4 / extended).`,
    verifyTask: `Adversarially verify INDEX_PLAYS against the published Hi-Lo Illustrious 18 + Fab 4 + standard extended indices. For EACH entry confirm: correct index number, correct comparator direction (gte vs lte), correct action and basicAction, correct upcard/total/pairRank. Specifically check the Illustrious 18 indices and Fab 4 surrender indices (Insurance +3, 16v10 0, 15v10 +4, 13v2 -1, 12v4 0, 12v5 -2, 12v6 -1, 13v3 -2, 11vA +1, 9v2 +1, 10vA +4, 9v7 +3, 16v9 +5, 12v2 +3, 12v3 +2, 10,10v5 +5, 10,10v6 +4, 10v10 +4; surrenders 14v10 +3, 15v10 0, 15v9 +2, 15vA +1). Flag any wrong index, wrong direction, missing core play, or duplicate/contradictory entry.`,
  },
]

const tableResults = await pipeline(
  tableSpecs,
  // stage 1: author
  (spec) => agent(
    `${COMMON}\n${ENGINE_API}\nWrite ONE file: ${spec.file}\n${spec.authorTask}`,
    { label: `author:${spec.key}`, phase: 'Strategy tables' },
  ),
  // stage 2: adversarial verify
  (_authored, spec) => agent(
    `You are an adversarial blackjack-strategy auditor. Read ${spec.file} and ${TYPES}.\n${spec.verifyTask}\nReturn structured findings. Be precise; only report REAL errors against the canonical chart/indices. If correct, errorCount 0.`,
    { label: `verify:${spec.key}`, phase: 'Strategy tables', schema: VERIFY_SCHEMA },
  ),
  // stage 3: fix if needed
  (verdict, spec) => {
    if (!verdict || verdict.errorCount === 0) {
      return { key: spec.key, fixed: false, errorCount: verdict ? verdict.errorCount : -1, assessment: verdict?.assessment ?? 'verify failed' }
    }
    return agent(
      `${COMMON}\n${ENGINE_API}\nThe file ${spec.file} has verified strategy errors. Read it, then rewrite it correcting EXACTLY these errors (keep the same exports/signatures, keep correct cells unchanged):\n${JSON.stringify(verdict.errors, null, 2)}\nApply the 'expected' value for each listed cell. Then return a 1-2 sentence summary.`,
      { label: `fix:${spec.key}`, phase: 'Strategy tables' },
    ).then(() => ({ key: spec.key, fixed: true, errorCount: verdict.errorCount, errors: verdict.errors, assessment: verdict.assessment }))
  },
)

// ---------------------------------------------------------------------------
// Phase 3 — resolver + bots + drill (needs primitives + tables)
// ---------------------------------------------------------------------------
phase('Resolver & drill')
const resolver = await parallel([
  () => agent(
    `${COMMON}\n${ENGINE_API}\nTASK: Implement the strategy resolver and bot decision.\nWrite TWO files:\n- ${ROOT}\\src\\engine\\strategy.ts  (getCorrectPlay)\n- ${ROOT}\\src\\engine\\bots.ts      (botDecision = getCorrectPlay(ctx).action)\nimport from '@/engine/hand', '@/engine/basicStrategy', '@/engine/deviations'. Classify the hand (pair via evaluate().isPair/pairRank; soft via evaluate().soft; else hard) and map dealer upcard to UpcardValue (Ace=11). Look up the index play of the right kind; only deviate when shouldDeviate AND legal. Build a clear 'reason'. Insurance is NOT handled here (game layer does it).`,
    { label: 'strategy+bots', phase: 'Resolver & drill' },
  ),
  () => agent(
    `${COMMON}\n${ENGINE_API}\nTASK: Implement the drill scenario generator.\nWrite ONE file: ${ROOT}\\src\\engine\\drillEngine.ts\nimport INDEX_PLAYS from '@/engine/deviations', getCorrectPlay from '@/engine/strategy', evaluate from '@/engine/hand', and use '@/types'. Also you may import buildShoe/cards helpers if useful, but you can construct Card objects directly (ranks/suits with unique ids).\nbuildDrillQueue: for each non-insurance INDEX_PLAY, create scenario(s) that TEST THE BOUNDARY. For each play:\n  - pick decksRemaining = 2 and runningCount so that the EXACT trueCount = an integer at the index (deviation applies). Use trueCount = running/decksRemaining, so running = index*2.\n  - ALSO optionally create a second scenario one count below the index (index-1) where the basic play applies, to test the line (include both; it makes a better drill).\n  - construct playerCards: hard total -> two cards (or three) summing to total with no ace and not a pair; soft total -> Ace + (total-11); pair -> two cards of pairRank; matching the play.kind.\n  - dealerUpcard: a card whose value == play.upcard (Ace if 11).\n  - correct = getCorrectPlay({ playerCards, dealerUpcard, trueCount, canDouble:true, canSplit:(kind==='pair'), canSurrender: opts.surrenderEnabled, ruleset: opts.ruleset, dasEnabled: opts.das }).\n  - label like "Hard 16 vs 10 — TC +1". Build deterministic unique ids and a deterministic ordering (do NOT use Math.random for ordering; a fixed interleave is fine). SKIP kind:'insurance'. Return the full queue.`,
    { label: 'drillEngine', phase: 'Resolver & drill' },
  ),
])

// ---------------------------------------------------------------------------
// Phase 4 — UI components (parallel)
// ---------------------------------------------------------------------------
phase('UI components')
const components = await parallel([
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the TABLE rendering components with Tailwind CSS classes (mobile-first, big touch targets, dark felt theme: bg-felt, accents emerald/amber).\nWrite THREE files:\n- ${ROOT}\\src\\components\\PlayingCard.tsx\n- ${ROOT}\\src\\components\\HandView.tsx\n- ${ROOT}\\src\\components\\DealerArea.tsx\nMatch the prop contracts EXACTLY. HandView imports PlayingCard; DealerArea imports PlayingCard. Use evaluate-free rendering (the HandValue is already on hand.value / dealer.value). Make cards look like real cards (rank corners + suit). Keep it crisp on small screens.`,
    { label: 'table-components', phase: 'UI components' },
  ),
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the CONTROL components with Tailwind (mobile-first, big tap targets).\nWrite FOUR files:\n- ${ROOT}\\src\\components\\ActionBar.tsx\n- ${ROOT}\\src\\components\\CountDisplay.tsx\n- ${ROOT}\\src\\components\\ShoeIndicator.tsx\n- ${ROOT}\\src\\components\\HintBanner.tsx\nMatch the prop contracts EXACTLY. ActionBar: color-code (Stand=red, Hit=green, Double=amber, Split=blue, Surrender=gray), large full-width buttons, only render legal actions. CountDisplay renders null if both flags false.`,
    { label: 'control-components', phase: 'UI components' },
  ),
])

// ---------------------------------------------------------------------------
// Phase 5 — screens (parallel, need components + store hooks)
// ---------------------------------------------------------------------------
phase('Screens')
const screens = await parallel([
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the HOME screen.\nWrite ONE file: ${ROOT}\\src\\screens\\HomeScreen.tsx (default export).\nBig title "Blackjack Trainer". Two primary buttons: "Play" (calls useGame.getState().startPlayRound() then useUi.getState().go('play')) and "Deviation Drill" (startDrillSession() then go('drill')). A "Settings" button -> go('settings'). Show a compact summary of current settings (decks, S17, surrender on/off, count visibility) read from useSettings. Polished, centered, mobile.`,
    { label: 'home', phase: 'Screens' },
  ),
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the SETTINGS screen.\nWrite ONE file: ${ROOT}\\src\\screens\\SettingsScreen.tsx (default export).\nControls bound to useSettings for EVERY Settings field: ruleset (S17 selectable, H17 shown disabled "coming soon"), decks (stepper 1–8), surrenderEnabled (toggle), dasEnabled (toggle), showRunningCount (toggle), showTrueCount (toggle), showCorrectMove (toggle), numHands (stepper 1–4), numOtherPlayers (stepper 0–5), penetration (slider 0.5–0.95 shown as %). A "Back" button -> useUi.go('home'). A "Reset to defaults" button -> useSettings.getState().reset(). Group into sections (Rules / Display / Table). Use settings.set(key, value).`,
    { label: 'settings', phase: 'Screens' },
  ),
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the PLAY screen (the main table).\nWrite ONE file: ${ROOT}\\src\\screens\\PlayScreen.tsx (default export).\nLayout top→bottom: top bar with ShoeIndicator + CountDisplay (driven by useSettings flags + useGame count) + an "End" button (useGame.endSession() then useUi.go('summary')). Then DealerArea. Then the seats: render each SeatView in useGame.seats; for each seat render its hands via HandView with the seat label; visually mark the active hand. Then HintBanner (canShow = useSettings.showCorrectMove && it's the human's turn && !revealed; onShow = useGame.revealHint; revealed = !!useGame.hint). Then ActionBar (legal = useGame.legalActions, onAction = useGame.act) shown during playerTurn. When phase === 'roundOver', show round outcomes and a "Next round" button (useGame.startPlayRound()). Use selectors. Keep it scrollable and within safe areas.`,
    { label: 'play-screen', phase: 'Screens' },
  ),
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the DRILL screen.\nWrite ONE file: ${ROOT}\\src\\screens\\DrillScreen.tsx (default export).\nDriven by useGame.drill (DrillScenario) and useGame mistakes/decisionsCount. Show the scenario label and the pre-set TC prominently (drills are about knowing the index, so always show count via CountDisplay with showTrue forced true). Render the player's hand (build a PlayerHandView-like object from drill.playerCards using its value — you may compute a minimal HandView by wrapping; simplest: render PlayingCard list + a small total). Render DealerArea-style single upcard (use DealerArea with a DealerView built from { cards:[drill.dealerUpcard], value: <upcard value>, upcard: drill.dealerUpcard, holeRevealed:false } OR just PlayingCard). ActionBar with legal actions (hit/stand always; double if 2 cards; split if pair; surrender if enabled) calling useGame.act. HintBanner (canShow = useSettings.showCorrectMove). After the user acts, useGame advances; show a correct/incorrect flash then a "Next" button (useGame.nextDrill()). "End" button -> endSession()+go('summary'). Show progress "Spot X / N".\nNOTE: the gameStore drives correctness; you only render drill state and call act()/nextDrill(). Keep it robust to drill being null (show a loading/empty state).`,
    { label: 'drill-screen', phase: 'Screens' },
  ),
  () => agent(
    `${COMMON}\n${UI_CONTRACT}\nTASK: Build the SESSION SUMMARY screen.\nWrite ONE file: ${ROOT}\\src\\screens\\SummaryScreen.tsx (default export).\nRead useGame.mistakes (MistakeRecord[]) and useGame.decisionsCount. Header stats: decisions, mistakes, accuracy %. If zero mistakes show a congratulations state. Otherwise a scrollable list; each mistake row shows: the player hand (render PlayingCard mini for playerCards) vs dealerUpcard, TC (record.trueCount, 1 decimal), "You: <chosen>" vs "Correct: <correct>", a DEVIATION tag when isDeviation, and the reason. A "Home" button -> useGame.resetSession() then useUi.go('home'). Mobile, readable.`,
    { label: 'summary-screen', phase: 'Screens' },
  ),
])

// ---------------------------------------------------------------------------
// Phase 6 — integration review (read everything, report mismatches)
// ---------------------------------------------------------------------------
phase('Integration review')
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'issues', 'summary'],
  properties: {
    ok: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'severity', 'detail'],
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['error', 'warning'] },
          detail: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}
const review = await agent(
  `You are an integration reviewer. Read ${TYPES} and ALL files under ${ROOT}\\src\\engine and ${ROOT}\\src\\components and ${ROOT}\\src\\screens.\nCheck for: (a) export signatures that DON'T match the ENGINE/UI contracts; (b) imports of things that don't exist; (c) type mismatches against '@/types'; (d) screens referencing GameStore fields/methods that aren't in the '@/types' GameStore interface; (e) obvious TypeScript errors (implicit any, missing returns, null handling). Do NOT run tsc; reason from reading. Report concrete, actionable issues with file + detail. The contracts:\n${ENGINE_API}\n${UI_CONTRACT}`,
  { label: 'integration-review', phase: 'Integration review', schema: REVIEW_SCHEMA },
)

return {
  primitives,
  tableResults,
  resolver,
  components,
  screens,
  review,
}
