import type { Card } from './cards.ts';
import { cardPointValue } from './cards.ts';
import { baseBand, sameRankBonusCounts } from './scoring.ts';

export type PlayerState = {
  id: string;
  team: 'A' | 'B';
  hand: Card[];
  finishRank?: number;
  bonusDelta: number;
};

export type HandSettlement = {
  teamScores: { A: number; B: number };
  transferred: { A: number; B: number };
  penalty40: { A: number; B: number };
  baseBand: 5 | 10 | 15 | null;
  baseDelta: { A: number; B: number };
  bonuses: { playerId: string; count: 7 | 8 | 9; delta: number }[];
};

/** Record a player's finishing position exactly when their last cards are played. */
export function recordFinish(player: PlayerState, order: number): void {
  if (player.hand.length === 0 && player.finishRank == null) player.finishRank = order;
}

export function remainingPoints(player: PlayerState): number {
  return player.hand.reduce((s, c) => s + cardPointValue(c), 0);
}

/**
 * Finish condition: the first two finishers being teammates ends the hand.
 * If the first two are opponents, play continues until a team gets its second finisher.
 */
export function handIsFinished(players: PlayerState[]): boolean {
  const finished = players.filter(p => p.finishRank != null);
  if (finished.length < 2) return false;
  // The hand ends as soon as either team has its second finisher.
  return players.some(p => p.finishRank != null && players.filter(q => q.team === p.team && q.finishRank != null).length === 2);
}

/**
 * Settlement follows the user's confirmed special cases:
 * - If one team has both players out, all scoring cards remaining in the other team
 *   transfer to the finished team.
 * - If the two players left at the end are teammates, their remaining scoring cards
 *   also transfer, then those two players each receive -20 (team total -40).
 * - Base 5/10/15 is then calculated from the resulting team scores.
 * - 7/8/9 same-rank bonuses are independent and cumulative.
 */
export function settleHand(players: PlayerState[], capturedScore: { A: number; B: number } = { A: 0, B: 0 }): HandSettlement {
  const remainingTeam = { A: 0, B: 0 };
  for (const p of players) remainingTeam[p.team] += remainingPoints(p);
  const teamScore = { A: capturedScore.A, B: capturedScore.B };

  // If a team has both players out, all scoring cards still held by the opponent
  // transfer to the finished team. The finished team therefore receives those
  // points in addition to points it already captured while playing.
  const outA = players.filter(p => p.team === 'A').every(p => p.hand.length === 0);
  const outB = players.filter(p => p.team === 'B').every(p => p.hand.length === 0);
  const transferred = { A: 0, B: 0 };
  if (outA && !outB) {
    transferred.A = remainingTeam.B;
    teamScore.A += remainingTeam.B;
    teamScore.B += 0;
  } else if (outB && !outA) {
    transferred.B = remainingTeam.A;
    teamScore.B += remainingTeam.A;
  } else {
    // No whole-team transfer: remaining scoring cards stay with their team.
    teamScore.A += remainingTeam.A;
    teamScore.B += remainingTeam.B;
  }

  // If exactly two players remain and they are teammates, transfer their remaining
  // points first, then apply -20 to each of those two players (team total -40).
  const remaining = players.filter(p => p.hand.length > 0);
  const penalty40 = { A: 0, B: 0 };
  if (remaining.length === 2 && remaining[0].team === remaining[1].team) {
    const loser = remaining[0].team;
    const winner = loser === 'A' ? 'B' : 'A';
    const points = remainingTeam[loser];
    transferred[winner] += points;
    teamScore[winner] += points;
    // Remove those held points from the losing team's score, then apply -40.
    teamScore[loser] -= points;
    teamScore[loser] -= 40;
    penalty40[loser] = -40;
  }

  const band = baseBand(teamScore.A, teamScore.B);
  const baseDelta = { A: 0, B: 0 };
  if (band) { baseDelta.A = teamScore.A >= teamScore.B ? band : -band; baseDelta.B = -baseDelta.A; }

  const bonuses: HandSettlement['bonuses'] = [];
  for (const p of players) {
    const counts = sameRankBonusCounts(p.hand);
    for (const count of counts.values()) {
      const delta = count === 7 ? 5 : count === 8 ? 10 : 15;
      bonuses.push({ playerId: p.id, count, delta });
    }
  }
  return { teamScores: teamScore, transferred, penalty40, baseBand: band, baseDelta, bonuses };
}
