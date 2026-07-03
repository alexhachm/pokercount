# Hi-Lo Deviation Index — research deliverable

Machine-readable, cross-source-verified index of Hi-Lo card-counting **deviations** (index plays) spanning game types, produced by a multi-agent deep-research pass. This is a **research + data** artifact — it does not touch the engine. A building agent wires it in.

## Files

| File | What it is |
|---|---|
| `deviations-index.json` | The data. 66 deviations + 9 unresolved source conflicts, with a self-documenting `fieldSchema`, `wiring`, and `counts` header. **Start here.** |
| `game-type-notes.md` | Verbatim parameterization report: exactly how indices shift with S17/H17, deck count, DAS, and surrender. The reasoning behind every `indexH17`, `requiresDAS`, `requiresSurrender`, `deckScope`. |
| `README.md` | This file. |

## What's in the set

- **66 deviations**, deduped by `(kind, total/pairRank, upcard, action)`.
  - by kind: 40 hard · 14 soft · 11 pair · 1 insurance
  - by tag: 18 `illustrious18` (incl. insurance) · 4 `fab4` · 1 `catch22` · 44 `extended`
  - by confidence: 17 high · 18 medium · 31 low
- **9 unresolved** entries where authoritative sources genuinely disagree — recorded, not silently averaged. See `deviations-index.json → unresolved` and the per-entry `notes`.

Baseline is **6-deck, S17, DAS, late surrender**, balanced Hi-Lo, pivot TC 0, insurance +3.

## Record shape

Each record is a **superset of the app's `IndexPlay`** (`src/types/index.ts`), so wiring is a projection, not a rewrite. Same `id` / `kind` / `total` / `pairRank` / `upcard` / `comparator` / `action` / `basicAction` conventions the current `src/engine/deviations.ts` already uses, plus the game-type dimensions:

```jsonc
{
  "id": "hard16v10",          // app id convention: hard<total>v<up> | soft.. | pair<rank>v<up> | surr<total>v<up> | "insurance"
  "kind": "hard",             // hard | soft | pair | insurance
  "spot": "16 v 10",
  "dealerUpcard": 10,          // 2..10, 11 = Ace, null for insurance   (maps to IndexPlay.upcard)
  "playerTotal": 16,           // null for pair/insurance                (maps to IndexPlay.total)
  "pairRank": null,            // "2".."9","10","A"                      (maps to IndexPlay.pairRank)
  "action": "stand",           // action when the count TRIGGERS the play
  "basicAction": "hit",        // non-triggering fallback (multi-deck S17 basic)
  "comparator": "gte",         // gte = deviate at TC >= index; lte = deviate at TC <= index
  "indexS17": 0,               // integer boundary TC under S17 (null = no play under S17)
  "indexH17": 0,               // integer boundary TC under H17 (null = basic strategy / no play)
  "tags": ["illustrious18"],
  "requiresDAS": false,        // low-pair splits only
  "requiresSurrender": false,  // all surrender lines
  "deckScope": "all",          // "all" = deck-count independent (4/6/8-deck TC)
  "confidence": "high",
  "sources": ["Schlesinger Blackjack Attack 3e", "..."],
  "notes": "..."
}
```

The full field contract is embedded in `deviations-index.json → fieldSchema` (read it from the data).

## How to wire it (projection to `IndexPlay`)

The current engine keys `findIndexPlay()` uniquely on `(kind, total/pairRank, upcard)` and takes the **first match**. Build the flat `INDEX_PLAYS` for the active ruleset like this:

```ts
import data from '@/../research/deviations/deviations-index.json'
import type { IndexPlay, Rank, UpcardValue } from '@/types'

function toIndexPlays(ruleset: 'S17' | 'H17', opts: { surrender: boolean; das: boolean }): IndexPlay[] {
  const key = ruleset === 'H17' ? 'indexH17' : 'indexS17'
  return data.deviations
    // 1. play must exist for this ruleset
    .filter((d) => d[key] !== null)
    // 2. respect table rules
    .filter((d) => (!d.requiresSurrender || opts.surrender) && (!d.requiresDAS || opts.das))
    // 3. collapse to ONE entry per (kind,total/pairRank,upcard): surrender line wins when
    //    surrender is on, else the stand line — mirrors the app's existing dedupe rule.
    .filter(pickCanonicalPerSpot(opts.surrender))
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      total: d.playerTotal ?? undefined,
      pairRank: (d.pairRank ?? undefined) as Rank | undefined,
      upcard: (d.dealerUpcard ?? undefined) as UpcardValue | undefined,
      index: d[key] as number,
      comparator: d.comparator,
      action: d.action,
      basicAction: d.basicAction,
      description: d.notes || d.spot,
    }))
}
```

Key wiring facts (also in `deviations-index.json → wiring`):

- **Duplicate spots are intentional.** The set records both a stand line and a surrender line for spots like `15 v 10` (`hard15v10` + `surr15v10`), `16 v 9`, `16 v 10`, `16 v A`, and `8,8 v 10`. The app's flat array must keep **one per spot** — pick per the existing rule (surrender canonical when offered, else stand). Don't emit both into `INDEX_PLAYS`.
- **Comparator sign trap.** Lower-bound stiff-stands `13v2 (−1)`, `13v3 (−2)`, `12v5 (−2)`, `12v6 (−1)` are `gte` with a **negative** index (stand at/above, hit below). The only genuine `lte` cases are the poor-deck plays: `10v9`, `9v3`, `A,8 v6` (H17), and the DAS low-pair "stop splitting → hit" lines. Preserve as-is.
- **`indexH17: null` means "no deviation"** — the play is basic strategy under H17 (e.g. `11 v A`, `A,7 v 2`, `A,6 v 2`), so drop it from the H17 array rather than treating null as 0.
- **Deck count → don't reindex.** One TC table serves 4/6/8 decks (`deckScope: "all"`). Single/double deck warrants a separate running-count mode — see `game-type-notes.md §2`.
- **Low-confidence entries** (31 of 66, several flagged "candidate for removal" in `notes`, plus the deep-negative surrender floors) are included for completeness. Gate them behind review before drilling users on them; the `illustrious18` + `fab4` + high/medium set is the safe core.

## Provenance

Anchored to Don Schlesinger *Blackjack Attack* 3e (p. 213, origin of the Illustrious 18 / Fab 4; floored indices), Stanford Wong *Professional Blackjack* (full index tables + Appendix A), Wizard of Odds, and the Blackjack Apprenticeship S17/H17 deviation charts; extended low-confidence plays lean on GameMaster / Blackjack Review and Wong appendix values. Every numeric value went through an adversarial cross-source verification pass; conflicts that survived are in `unresolved`.
