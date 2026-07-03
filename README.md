# Blackjack Trainer

A card-counting & basic-strategy/deviation trainer built as an installable PWA
(React + TypeScript + Vite). Developed and tested on Windows; installs on iPhone
straight from Safari — no Mac or App Store required.

## What it does

- **Play mode** — the dealer deals you cards and shows an upcard. Hit / Stand /
  Double (and Split / Surrender when legal). A pre-deal **table setup** lets you
  pick your **seat** (7 seats total), how many **hands** you play, and how many
  **bot players** sit with you — they play perfect basic strategy + Hi-Lo
  deviations (and now split too), so the count develops realistically. Cards
  **deal in with a smooth animation**, and a **growing discard tray** in the
  top-left lets you estimate decks remaining (and so the true count) by eye.
- **Deviation drill** — back-to-back index-play spots. The true count is
  pre-set to test each deviation at its boundary; you just make the play and it
  cycles to the next spot.
- **Show correct move** — optionally reveal the textbook play (with the reason)
  before you act.
- **Counting aids** — optionally show the running count and/or true count, plus a
  shoe indicator (decks total + decks remaining).
- **Session summary** — every mistake you made, with the spot, the count, what
  you played, the correct play, and why.

Settings: ruleset (Stand-on-Soft-17), number of decks, surrender on/off,
double-after-split, count visibility, hint visibility, number of your hands,
number of bot players, shoe penetration, and a **deviation-range limit** — cap
the index plays you train to a true-count window (e.g. −3 to +6) so you only
drill the deviations worth memorising. Count and "show correct move" can also be
toggled right on the table, not just in settings.

## Run it (Windows)

```bash
npm install
npm run dev
```

Vite prints a Local URL and a Network URL (e.g. `http://192.168.x.x:5173`).

## Install on your iPhone

1. Make sure your iPhone is on the **same Wi-Fi** as the PC.
2. On the iPhone, open the **Network URL** from `npm run dev` in **Safari**.
3. Tap the **Share** button → **Add to Home Screen**.
4. Launch it from the home-screen icon — it runs full-screen like a native app.

For a production build:

```bash
npm run build
npm run preview   # serves dist/ on the network
```

(The service worker that makes it installable/offline only registers in a
built/preview server or over HTTPS, not always in plain `npm run dev`.)

## Project layout

```
src/
  types/            shared domain contract (cards, hands, settings, view models)
  engine/           pure game logic (no React)
    cards.ts, shoe.ts        deck + shoe
    hand.ts                  hand evaluation
    count.ts                 Hi-Lo running / true count
    basicStrategy.ts         multi-deck S17 basic strategy chart
    deviations.ts            full Hi-Lo index table (Illustrious 18 + Fab 4 + more)
    strategy.ts              resolver: basic strategy + deviations
    dealer.ts                dealer play (S17)
    bots.ts                  bot decisions
    drillEngine.ts           deviation-drill scenario generator
  store/            zustand stores (settings, ui nav, game state machine)
  components/        card / hand / dealer / action bar / count / hint UI
  screens/          home, play, drill, settings, summary
scripts/
  gen-icons.mjs     regenerates the PWA PNG icons
```

## Notes / v1 simplifications

- Only the **S17** ruleset is wired (H17 is reserved in the data model).
- Bots play hit/stand/double and split (resplit to 4 hands; split aces get one
  card each), matching the human's options for a realistic count flow.
- Insurance is represented in the index data but not offered interactively in
  Play mode yet.
- Strategy/deviation tables were authored and then adversarially verified
  against the canonical multi-deck S17 chart and published Hi-Lo indices.

Replace the generated icons in `public/` (or edit `scripts/gen-icons.mjs`) to
rebrand.
