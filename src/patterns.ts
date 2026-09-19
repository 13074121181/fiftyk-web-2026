import type { Card, Rank } from './cards.ts';

export type Pattern =
  | { kind: 'single'; cards: Card[]; key: number }
  | { kind: 'pair'; cards: Card[]; key: number }
  | { kind: 'triple'; cards: Card[]; key: number }
  | { kind: 'straight'; cards: Card[]; length: number; key: number }
  | { kind: 'consecutivePairs'; cards: Card[]; pairCount: number; key: number }
  | { kind: 'bomb'; cards: Card[]; bombRank: number; bombSize: number; bombTier: number }
  | { kind: 'fiftyK'; cards: Card[]; real: boolean; suitRank?: number }
  | { kind: 'multiBombs'; cards: Card[]; bombs: Extract<Pattern,{kind:'bomb'}>[] };

const bombRanks: Rank[] = [3,4,5,6,7,8,9,10,11,12,13,14,15];
const suitRank: Record<string,number> = { clubs: 1, diamonds: 2, spades: 3, hearts: 4 };
const FIFTYK_TIER = 40;

export function isFiftyK(cards: Card[]): {real:boolean; suitRank?:number} | null {
  if (cards.length !== 3) return null;
  const ranks = cards.map(c => c.rank).sort((a,b)=>a-b);
  if (ranks.join(',') !== '5,10,13') return null;
  const nonJoker = cards.every(c => c.suit !== 'joker');
  if (!nonJoker) return null;
  const same = cards.every(c => c.suit === cards[0].suit);
  return same ? {real:true, suitRank:suitRank[cards[0].suit]} : {real:false};
}

function uniqueSortedRanks(cards: Card[]): Rank[] {
  return [...new Set(cards.map(c=>c.rank))].sort((a,b)=>a-b) as Rank[];
}
function isStraightRanks(ranks: Rank[]): boolean {
  if (ranks.length < 3 || new Set(ranks).size !== ranks.length) return false;
  if (ranks.some(r => r >= 15)) return false; // 2 and jokers excluded
  // A may only appear as the final rank.
  const sorted = [...ranks].sort((a,b)=>a-b);
  if (sorted.includes(14) && sorted[sorted.length-1] !== 14) return false;
  for (let i=1;i<sorted.length;i++) if (sorted[i] !== sorted[i-1]+1) return false;
  return true;
}
function isConsecutivePairs(cards: Card[]): boolean {
  if (cards.length < 6 || cards.length % 2 !== 0) return false;
  const counts = new Map<Rank,number>();
  for (const c of cards) counts.set(c.rank,(counts.get(c.rank)??0)+1);
  if ([...counts.values()].some(v=>v!==2)) return false;
  return isStraightRanks([...counts.keys()] as Rank[]);
}

export type TripleMode = 'ordinary'|'bomb';
export function classify(cards: Card[], tripleMode: TripleMode = 'ordinary'): Pattern | null {
  if (cards.length === 0) return null;
  const fifty = isFiftyK(cards);
  if (fifty) return {kind:'fiftyK',cards:[...cards],real:fifty.real,suitRank:fifty.suitRank};

  const ranks = uniqueSortedRanks(cards);
  const counts = new Map<Rank,number>();
  for (const c of cards) counts.set(c.rank,(counts.get(c.rank)??0)+1);

  if (cards.length === 1) return {kind:'single',cards:[...cards],key:cards[0].rank};
  if (cards.length === 2 && counts.size === 1) return {kind:'pair',cards:[...cards],key:ranks[0]};
  if (cards.length === 3 && counts.size === 1) {
    if (tripleMode === 'bomb') return makeBomb(cards);
    return {kind:'triple',cards:[...cards],key:ranks[0]};
  }
  if (counts.size === 1 && cards.length >= 3) return makeBomb(cards);
  if (cards.length >= 3 && isConsecutivePairs(cards)) {
    const rs = [...counts.keys()] as Rank[];
    return {kind:'consecutivePairs',cards:[...cards],pairCount:rs.length,key:Math.max(...rs)};
  }
  if (cards.length >= 3 && isStraightRanks(ranks) && ranks.length === cards.length) {
    return {kind:'straight',cards:[...cards],length:cards.length,key:Math.max(...ranks)};
  }
  return null;
}

function makeBomb(cards: Card[]): Extract<Pattern,{kind:'bomb'}> {
  const rank = cards[0].rank;
  const size = cards.length;
  if (!bombRanks.includes(rank) || size < 3 || size > 12) throw new Error('Invalid ordinary bomb');
  return {kind:'bomb',cards:[...cards],bombRank:rank,bombSize:size,bombTier:bombTier(rank,size)};
}

// Global bomb order, exactly as specified by the user.
function bombTier(rank: number, size: number): number {
  // Exact cross-type order:
  // 3-bomb < 4-bomb < Fifty-K < mixed 2-joker < 2-small < 2-big
  // < 5-bomb < 3-joker < 6-bomb < 4-joker < 7-bomb < ... < 12-bomb.
  if (size === 3) return rank;                 // 3..15
  if (size === 4) return 20 + rank;            // 23..35
  if (size >= 5) return 50 + (size - 5) * 2; // 5-bomb=50, 6-bomb=52, 7-bomb=54, ...
  return 0;
}


export function classifyBombOrSpecial(cards: Card[]): Pattern | null {
  if (cards.length === 2 && cards.every(c=>c.suit==='joker')) {
    const big = cards.filter(c=>c.rank===17).length;
    const small = cards.filter(c=>c.rank===16).length;
    if (big + small === 2) {
      const tier = big===1 ? 41 : big===0 ? 42 : 43;
      return {kind:'bomb',cards:[...cards],bombRank:16,bombSize:2,bombTier:tier};
    }
  }
  if (cards.length === 3 && cards.every(c=>c.suit==='joker'))
    return {kind:'bomb',cards:[...cards],bombRank:17,bombSize:3,bombTier:51};
  if (cards.length === 4 && cards.every(c=>c.suit==='joker'))
    return {kind:'bomb',cards:[...cards],bombRank:17,bombSize:4,bombTier:53};
  return classify(cards,'bomb');
}

export function compareSamePattern(a: Pattern,b: Pattern): number {
  if (a.kind !== b.kind) return 0;
  if (a.kind === 'single' && b.kind === 'single') return Math.sign(a.key-b.key);
  if (a.kind === 'pair' && b.kind === 'pair') return Math.sign(a.key-b.key);
  if (a.kind === 'triple' && b.kind === 'triple') return Math.sign(a.key-b.key);
  if (a.kind === 'straight' && b.kind === 'straight') return a.length===b.length ? Math.sign(a.key-b.key) : 0;
  if (a.kind === 'consecutivePairs' && b.kind === 'consecutivePairs') return a.pairCount===b.pairCount ? Math.sign(a.key-b.key) : 0;
  if (a.kind === 'fiftyK' && b.kind === 'fiftyK') {
    if (a.real !== b.real) return a.real ? 1 : -1;
    if (!a.real) return 0;
    return Math.sign((a.suitRank??0)-(b.suitRank??0));
  }
  if (a.kind === 'bomb' && b.kind === 'bomb') return Math.sign(a.bombTier-b.bombTier);
  return 0;
}

export function canBeat(previous: Pattern, next: Pattern): boolean {
  // Ordinary patterns can only be beaten by the same pattern or a sufficiently strong bomb.
  if (next.kind === 'bomb') {
    if (previous.kind === 'bomb') return next.bombTier > previous.bombTier;
    if (previous.kind === 'fiftyK') return next.bombTier > FIFTYK_TIER;
    return true;
  }
  if (previous.kind === 'bomb') {
    return next.kind === 'fiftyK' ? FIFTYK_TIER > previous.bombTier : false;
  }
  if (previous.kind === 'fiftyK') {
    return next.kind === 'fiftyK' && compareSamePattern(previous,next) < 0;
  }
  return compareSamePattern(previous,next) < 0;
}
