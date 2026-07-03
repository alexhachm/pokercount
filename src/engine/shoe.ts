import type { Card } from '@/types'
import { buildShoe, shuffle } from '@/engine/cards'

/**
 * A mutable shoe of `decks` decks. Builds and shuffles immediately.
 *
 * Internal representation: `cards` holds the undrawn cards, and the NEXT card
 * to be drawn is the LAST element (the "top" of the deck is the back of the
 * array). This makes draw() an O(1) pop and stackNext() an O(k) push of the
 * forced cards in reverse so cards[0] ends up on top.
 */
export class Shoe {
  readonly decks: number
  private readonly rng: () => number
  private cards: Card[]
  private drawn = 0

  constructor(decks: number, rng: () => number = Math.random) {
    this.decks = decks
    this.rng = rng
    this.cards = shuffle(buildShoe(decks), rng)
  }

  /** Remove and return the next card (top of deck). Throws if empty. */
  draw(): Card {
    const card = this.cards.pop()
    if (card === undefined) throw new Error('Shoe is empty')
    this.drawn++
    return card
  }

  /**
   * Draw the card nearest the top that matches `pred`, leaving the rest of
   * the shoe order untouched (used by the hand-type training filter to rig
   * the human's opening cards). Falls back to a normal draw when no undrawn
   * card matches, so a depleted shape can never wedge the deal.
   */
  drawMatching(pred: (c: Card) => boolean): Card {
    for (let i = this.cards.length - 1; i >= 0; i--) {
      if (pred(this.cards[i])) {
        const [card] = this.cards.splice(i, 1)
        this.drawn++
        return card
      }
    }
    return this.draw()
  }

  /** Undrawn cards left in the shoe. */
  get remaining(): number {
    return this.cards.length
  }

  /** Cards drawn since construction or the last reset(). */
  get dealt(): number {
    return this.drawn
  }

  /** Remaining cards expressed in decks (exact, may be fractional). */
  get decksRemaining(): number {
    return this.cards.length / 52
  }

  /** True once the dealt fraction of the full shoe meets `penetration`. */
  shouldReshuffle(penetration: number): boolean {
    return this.drawn / (this.decks * 52) >= penetration
  }

  /** Rebuild and reshuffle the full shoe; resets the dealt counter. */
  reset(): void {
    this.cards = shuffle(buildShoe(this.decks), this.rng)
    this.drawn = 0
  }

  /**
   * Force the next draws to be exactly `cards`, with cards[0] drawn first.
   * The forced cards are appended on top of whatever remains; subsequent draws
   * fall through to the existing shoe. (Used by drill mode to stage scenarios.)
   */
  stackNext(cards: Card[]): void {
    // Push in reverse so cards[0] lands at the very top (last element).
    for (let i = cards.length - 1; i >= 0; i--) {
      this.cards.push(cards[i])
    }
  }
}
