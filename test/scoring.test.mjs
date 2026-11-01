import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreLine, matchBonus, fromApiFootball } from '../src/scoring.mjs';

test('forward with two goals and the top match bonus', () => {
  // Same line as Muriqi at full time in the demo
  const r = scoreLine({ pos: 'FV', minutes: 90, goals: 2, shotsOnTarget: 3, conceded: 1, bonus: 3 });
  assert.equal(r.total, 14.5);
});

test('defender earns points without scoring', () => {
  // Same line as Sánchez in the demo: 2 + 1 + 1 + 0.5 + 4 (clean sheet) + 2 (bonus)
  const r = scoreLine({ pos: 'DF', minutes: 90, tackles: 2, interceptions: 2, blocks: 1, conceded: 0, bonus: 2 });
  assert.equal(r.total, 10.5);
  assert.ok(r.rows.some((row) => row.key === 'cleanSheet'));
});

test('substitute under 60 minutes gets 1 point and no clean sheet', () => {
  const r = scoreLine({ pos: 'DF', minutes: 25, conceded: 0 });
  assert.equal(r.total, 1);
});

test('defender loses 1 point for every 2 goals conceded', () => {
  assert.equal(scoreLine({ pos: 'DF', minutes: 90, conceded: 3 }).total, 1);
  assert.equal(scoreLine({ pos: 'KL', minutes: 90, conceded: 4, saves: 2 }).total, 1);
});

test('midfielders get the small clean sheet, forwards none', () => {
  assert.equal(scoreLine({ pos: 'OS', minutes: 90, conceded: 0 }).total, 3);
  assert.equal(scoreLine({ pos: 'FV', minutes: 90, conceded: 0 }).total, 2);
});

test('second yellow counts only as a red', () => {
  const r = scoreLine({ pos: 'OS', minutes: 70, yellow: 1, red: 1, conceded: 2 });
  assert.equal(r.total, 2 - 3);
});

test('player who did not play scores nothing', () => {
  const r = scoreLine({ pos: 'FV', minutes: 0, goals: 0 });
  assert.equal(r.total, 0);
  assert.equal(r.rows.length, 0);
});

test('match bonus goes to the three best ratings', () => {
  const p = (id, rating, minutes = 90) => ({ id, rating, line: { pos: 'OS', minutes, conceded: 1 } });
  const bonus = matchBonus([p('a', 7.1), p('b', 8.4), p('c', 6.2), p('d', 7.9), p('e', null)]);
  assert.equal(bonus.get('b'), 3);
  assert.equal(bonus.get('d'), 2);
  assert.equal(bonus.get('a'), 1);
  assert.equal(bonus.has('c'), false);
  assert.equal(bonus.has('e'), false);
});

test('API-Football block maps nulls to zero and positions to ours', () => {
  const block = {
    games: { minutes: 88, position: 'M', rating: '7.4' },
    goals: { total: 1, assists: null, conceded: 0, saves: null },
    shots: { total: 3, on: 2 },
    passes: { key: 2 },
    tackles: { total: 1, blocks: null, interceptions: null },
    cards: { yellow: 0, red: 0 },
    penalty: { won: null, saved: null, missed: 0 },
  };
  const line = fromApiFootball(block, { teamConceded: 1 });
  assert.equal(line.pos, 'OS');
  assert.equal(line.conceded, 1);
  // Same as Laçi in the demo, before his bonus: 2 + 5 + 1 (chances) + 1 (shots) + 0.5 (tackle)
  assert.equal(scoreLine(line).total, 9.5);
});
