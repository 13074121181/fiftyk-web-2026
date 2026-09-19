import assert from 'node:assert/strict';
import { createDeck } from '../src/cards.ts';
import { handIsFinished, settleHand, type PlayerState } from '../src/game.ts';

const deck = createDeck();
assert.equal(deck.length, 160);
assert.equal(new Set(deck.map(c=>c.id)).size, 160);

const p = (id:string, team:'A'|'B', hand:any[] = []): PlayerState => ({id,team,hand,bonusDelta:0});

// First two opposing: not finished. A third finisher gives A its second finisher => finished.
const a = p('A','A'); a.finishRank=1;
const b = p('B','B'); b.finishRank=2;
const c = p('C','A');
const d = p('D','B');
assert.equal(handIsFinished([a,b,c,d]), false);
c.finishRank=3;
assert.equal(handIsFinished([a,b,c,d]), true);

// If A has captured 285 and B still holds 15, the 15 transfer to A => 300:0.
const x = p('x','A'); const y = p('y','A'); const z = p('z','B',[{id:'5',suit:'clubs',rank:5},{id:'k',suit:'clubs',rank:13}]); const w=p('w','B');
const st = settleHand([x,y,z,w], {A:285,B:0});
assert.deepEqual(st.teamScores, {A:300,B:0});
assert.equal(st.transferred.A,15);
assert.equal(st.baseBand,5);

console.log('game tests passed');
