export type Suit = 'clubs' | 'diamonds' | 'spades' | 'hearts' | 'joker';
export type Rank = 3|4|5|6|7|8|9|10|11|12|13|14|15|16|17;
// 3..10, J=11, Q=12, K=13, A=14, 2=15, small=16, big=17
export type Card = { id: string; suit: Suit; rank: Rank };

export const SUITS: Exclude<Suit,'joker'>[] = ['clubs','diamonds','spades','hearts'];
export const RANKS: Rank[] = [3,4,5,6,7,8,9,10,11,12,13,14,15];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 3; copy++) {
    for (const suit of SUITS) for (const rank of RANKS)
      deck.push({ id: `${copy}-${suit}-${rank}`, suit, rank });
    deck.push({ id: `${copy}-small-joker`, suit: 'joker', rank: 16 });
    deck.push({ id: `${copy}-big-joker`, suit: 'joker', rank: 17 });
  }
  // Remove one big joker and one small joker: 160 cards.
  deck.splice(deck.findIndex(c => c.rank === 17), 1);
  deck.splice(deck.findIndex(c => c.rank === 16), 1);
  return deck;
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function cardPointValue(card: Card): number {
  return card.rank === 5 ? 5 : (card.rank === 10 || card.rank === 13 ? 10 : 0);
}

export function rankName(rank: Rank): string {
  return ({11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'} as Record<number,string>)[rank] ?? String(rank);
}
