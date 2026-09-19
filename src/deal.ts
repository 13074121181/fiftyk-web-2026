import type { Card } from './cards.ts';
import { createDeck, shuffle } from './cards.ts';

export function dealFour(rng:()=>number=Math.random): Card[][] {
  const deck = shuffle(createDeck(), rng);
  const hands: Card[][] = [[],[],[],[]];
  for (let i=0;i<deck.length;i++) hands[i%4].push(deck[i]);
  return hands;
}
