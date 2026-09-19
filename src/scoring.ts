import { cardPointValue } from './cards.ts';
import type { Card } from './cards.ts';

export function scoreCards(cards: Card[]): number {
  return cards.reduce((sum,c)=>sum+cardPointValue(c),0);
}

export type Band = 5|10|15;
export function baseBand(teamScore: number, otherScore: number): Band | null {
  if (teamScore === 150 && otherScore === 150) return 5;
  if (teamScore >= 155 && teamScore <= 300 && otherScore >= 0 && otherScore <= 145) return 5;
  if (teamScore >= 305 && teamScore <= 320 && otherScore >= -20 && otherScore <= -5) return 10;
  if (teamScore >= 325 && teamScore <= 340 && otherScore >= -40 && otherScore <= -25) return 15;
  return null;
}

export type SpecialBonus = { playerId:string; count:7|8|9; delta:number };
export function sameRankBonusCounts(hand: Card[]): Map<number,7|8|9> {
  const counts = new Map<number,number>();
  for (const c of hand) counts.set(c.rank,(counts.get(c.rank)??0)+1);
  const result = new Map<number,7|8|9>();
  for (const [rank,n] of counts) if (n>=7) result.set(rank, Math.min(n,9) as 7|8|9);
  return result;
}
