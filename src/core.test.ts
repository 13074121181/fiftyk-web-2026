import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/cards.ts';
import type { Card } from '../src/cards.ts';
import { classify, classifyBombOrSpecial, canBeat } from '../src/patterns.ts';
import { dealFour } from '../src/deal.ts';
import { scoreCards, sameRankBonusCounts } from '../src/scoring.ts';

const c=(rank:number,suit:any='clubs',id='x'):Card=>({id,suit,rank});

test('deck has 160 cards and 300 points',()=>{
  const deck=createDeck();
  assert.equal(deck.length,160);
  assert.equal(scoreCards(deck),300);
});

test('deal is 40 cards each',()=>{
  const hands=dealFour(()=>0.5);
  assert.deepEqual(hands.map(h=>h.length),[40,40,40,40]);
});

test('single and pair',()=>{
  assert.equal(classify([c(10)])?.kind,'single');
  assert.equal(classify([c(10),c(10,'diamonds')])?.kind,'pair');
});

test('three cards can be ordinary triple or explicit bomb',()=>{
  assert.equal(classify([c(7),c(7,'diamonds'),c(7,'spades')])?.kind,'triple');
  assert.equal(classify([c(7),c(7,'diamonds'),c(7,'spades')],'bomb')?.kind,'bomb');
});

test('straight supports QKA and rejects 2',()=>{
  assert.equal(classify([c(12),c(13),c(14)])?.kind,'straight');
  assert.equal(classify([c(13),c(14),c(15)]),null);
});

test('consecutive pairs supports QQ KK AA and rejects 2',()=>{
  assert.equal(classify([c(12),c(12,'diamonds'),c(13),c(13,'diamonds'),c(14),c(14,'diamonds')])?.kind,'consecutivePairs');
  assert.equal(classify([c(13),c(13,'diamonds'),c(14),c(14,'diamonds'),c(15),c(15,'diamonds')]),null);
});

test('real fiftyK suit order',()=>{
  const low=classify([c(5,'clubs'),c(10,'clubs'),c(13,'clubs')])!;
  const high=classify([c(5,'hearts'),c(10,'hearts'),c(13,'hearts')])!;
  assert.equal(canBeat(low,high),true);
});

test('false fiftyK is one shared size',()=>{
  const a=classify([c(5,'clubs'),c(10,'diamonds'),c(13,'hearts')])!;
  const b=classify([c(5,'spades'),c(10,'hearts'),c(13,'diamonds')])!;
  assert.equal(canBeat(a,b),false);
  assert.equal(canBeat(b,a),false);
});

test('two jokers order: mixed < two small < two big',()=>{
  const mixed=classifyBombOrSpecial([c(16,'joker'),c(17,'joker')])!;
  const small=classifyBombOrSpecial([c(16,'joker'),c(16,'joker')])!;
  const big=classifyBombOrSpecial([c(17,'joker'),c(17,'joker')])!;
  assert.equal(canBeat(mixed,small),true);
  assert.equal(canBeat(small,big),true);
});



test('full bomb hierarchy is ordered exactly',()=>{
  const b3=classifyBombOrSpecial([c(3),c(3,'diamonds'),c(3,'spades')])!;
  const b4=classifyBombOrSpecial([c(3),c(3,'diamonds'),c(3,'spades'),c(3,'hearts')])!;
  const fifty=classifyBombOrSpecial([c(5),c(10),c(13)])!;
  const mixed=classifyBombOrSpecial([c(16,'joker'),c(17,'joker')])!;
  const b5=classifyBombOrSpecial([...Array(5)].map((_,i)=>c(3,'clubs',`b5${i}`)))!;
  const j3=classifyBombOrSpecial([c(17,'joker'),c(17,'joker'),c(17,'joker')])!;
  const b6=classifyBombOrSpecial([...Array(6)].map((_,i)=>c(4,'clubs',`b6${i}`)))!;
  const j4=classifyBombOrSpecial([...Array(4)].map((_,i)=>c(17,'joker',`j4${i}`)))!;
  assert.equal(canBeat(b3,b4),true);
  assert.equal(canBeat(b4,fifty),true);
  assert.equal(canBeat(fifty,mixed),true);
  assert.equal(canBeat(mixed,b5),true);
  assert.equal(canBeat(b5,j3),true);
  assert.equal(canBeat(j3,b6),true);
  assert.equal(canBeat(b6,j4),true);
});
test('7/8/9 same-rank bonuses',()=>{
  const hand=[...Array(7)].map((_,i)=>c(3,'clubs',`a${i}`));
  const m=sameRankBonusCounts(hand);
  assert.equal(m.get(3),7);
});
