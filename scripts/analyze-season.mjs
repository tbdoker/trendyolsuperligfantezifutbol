// Season analysis: how points behave in the Süper Lig under our scoring.
// Answers the questions that decide the classic-mode rules:
//   - How concentrated are points (top players, big clubs)?      -> club limit, prices
//   - How often is the best captain the same player?             -> captain multiplier
//   - How often do stars play under 60 minutes?                  -> transfers, bench
//   - Are positions balanced?                                    -> scoring values
//   - How would performance-based prices move?                   -> pricing
//
//   SEASON=2024 node scripts/analyze-season.mjs   (reads data/2024, writes reports/season-2024.md)

import { readFile, readdir, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { scoreLine, matchBonus } from '../src/scoring.mjs';

const SEASON = Number(process.env.SEASON || 2024);
const DIR = `data/${SEASON}`;
const BIG = /galatasaray|fenerbah|be[sş]ikta[sş]|trabzon/i;
const FINISHED = ['FT', 'AET', 'PEN'];

const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

async function load() {
  const fixtures = JSON.parse(await readFile(`${DIR}/fixtures.json`, 'utf8'));
  const files = (await readdir(`${DIR}/matches`)).filter((f) => f.endsWith('.json'));
  const matches = [];
  for (const f of files) matches.push(JSON.parse(await readFile(`${DIR}/matches/${f}`, 'utf8')));
  matches.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
  return { fixtures, matches };
}

function scoreAll(matches) {
  const apps = [];
  for (const m of matches) {
    const played = m.players.filter((p) => p.line.minutes > 0);
    const bonus = matchBonus(played);
    for (const p of played) {
      const line = { ...p.line, bonus: bonus.get(p.id) ?? 0 };
      apps.push({
        round: m.fixture.round,
        fixtureId: m.fixture.id,
        id: p.id,
        name: p.name,
        team: p.team,
        teamId: p.teamId,
        pos: line.pos,
        minutes: line.minutes,
        line,
        points: scoreLine(line).total,
      });
    }
  }
  return apps;
}

function byPlayer(apps) {
  const map = new Map();
  for (const a of apps) {
    let p = map.get(a.id);
    if (!p) {
      p = { id: a.id, name: a.name, pos: a.pos, teams: new Map(), apps: 0, sixty: 0, minutes: 0, points: 0, rows: [] };
      map.set(a.id, p);
    }
    p.apps++;
    if (a.minutes >= 60) p.sixty++;
    p.minutes += a.minutes;
    p.points += a.points;
    p.teams.set(a.teamId, { name: a.team, n: (p.teams.get(a.teamId)?.n ?? 0) + 1 });
    p.rows.push(a);
  }
  for (const p of map.values()) {
    const [teamId, t] = [...p.teams.entries()].sort((x, y) => y[1].n - x[1].n)[0];
    p.teamId = teamId;
    p.team = t.name;
  }
  return [...map.values()];
}

function main(say, { fixtures, matches }) {
  const finished = fixtures.filter((f) => FINISHED.includes(f.status));
  const apps = scoreAll(matches);
  const players = byPlayer(apps).sort((a, b) => b.points - a.points);
  const rounds = [...new Set(matches.map((m) => m.fixture.round))].sort((a, b) => a - b);
  const totalPts = sum(apps.map((a) => a.points));

  // Club matches in the sample, and team results
  const clubs = new Map();
  for (const m of matches) {
    for (const [side, other] of [['home', 'away'], ['away', 'home']]) {
      const t = m.fixture[side];
      const c = clubs.get(t.id) ?? { id: t.id, name: t.name, matches: 0, cleanSheets: 0, points: 0 };
      c.matches++;
      if (m.fixture[other].goals === 0) c.cleanSheets++;
      clubs.set(t.id, c);
    }
  }
  for (const a of apps) clubs.get(a.teamId).points += a.points;

  say(`# Süper Lig ${SEASON}–${String(SEASON + 1).slice(2)} · season analysis`);
  say();
  say(`Matches analysed: **${matches.length} of ${finished.length}** finished (rounds ${rounds.join(', ')}).`);
  say(`${players.length} players appeared · ${apps.length} appearances · average **${r1(totalPts / apps.length)}** points per appearance.`);
  if (matches.length < finished.length) {
    say();
    say('> Partial season: the daily import adds about 90 matches a day until the season is complete.');
  }

  // 1. Positions
  say();
  say('## 1. Position balance');
  say();
  say('| Position | Appearances | Points per appearance | Points per 90 min | In top 50 |');
  say('|---|---|---|---|---|');
  const top50 = players.slice(0, 50);
  for (const pos of ['KL', 'DF', 'OS', 'FV']) {
    const xs = apps.filter((a) => a.pos === pos);
    const mins = sum(xs.map((a) => a.minutes));
    say(`| ${pos} | ${xs.length} | ${r1(sum(xs.map((a) => a.points)) / (xs.length || 1))} | ${r1((sum(xs.map((a) => a.points)) / (mins || 1)) * 90)} | ${top50.filter((p) => p.pos === pos).length} |`);
  }

  // 2. Concentration
  const bigClubs = [...clubs.values()].filter((c) => BIG.test(c.name));
  const bigPts = sum(bigClubs.map((c) => c.points));
  say();
  say('## 2. How concentrated are points?');
  say();
  say(`- The big four (Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor) are ${pct(4, clubs.size)}% of the clubs but scored **${pct(bigPts, totalPts)}%** of all points.`);
  say(`- Top 20 players: **${pct(sum(players.slice(0, 20).map((p) => p.points)), totalPts)}%** of all points. Top 50: ${pct(sum(top50.map((p) => p.points)), totalPts)}%.`);
  say(`- Big-four players in the top 20: **${players.slice(0, 20).filter((p) => BIG.test(p.team)).length}**, in the top 50: ${top50.filter((p) => BIG.test(p.team)).length}.`);
  say();
  say('Points per match by club (all its players together):');
  say();
  say('| Club | Matches | Points per match | Clean sheets |');
  say('|---|---|---|---|');
  for (const c of [...clubs.values()].sort((a, b) => b.points / b.matches - a.points / a.matches)) {
    say(`| ${c.name} | ${c.matches} | ${r1(c.points / c.matches)} | ${c.cleanSheets} (${pct(c.cleanSheets, c.matches)}%) |`);
  }

  // 3. Club limit
  const perClub = (list) => {
    const m = new Map();
    for (const p of list) m.set(p.team, (m.get(p.team) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const pick = (pos, n) => players.filter((p) => p.pos === pos).slice(0, n);
  const best15 = [...pick('KL', 2), ...pick('DF', 5), ...pick('OS', 5), ...pick('FV', 3)];
  const top50Clubs = perClub(top50);
  say();
  say('## 3. Would a 3-per-club limit bite?');
  say();
  say(`- Best possible 15 by total points (2 KL, 5 DF, 5 OS, 3 FV), per club: ${perClub(best15).map(([t, n]) => `${t} ${n}`).join(', ')}.`);
  say(`- Clubs with 3+ players in the top 50: **${top50Clubs.filter(([, n]) => n >= 3).length}**; with 4+: **${top50Clubs.filter(([, n]) => n >= 4).length}** (most: ${top50Clubs[0]?.[0]} with ${top50Clubs[0]?.[1]}).`);

  // 4. Captaincy
  say();
  say('## 4. Is the best captain always the same player?');
  say();
  const winners = new Map();
  let bigWinners = 0;
  let topSeasonInTop3 = 0;
  const seasonTop = players[0];
  const roundRows = [];
  for (const r of rounds) {
    const rs = apps.filter((a) => a.round === r).sort((a, b) => b.points - a.points);
    if (!rs.length) continue;
    const w = rs[0];
    winners.set(w.id, { name: w.name, n: (winners.get(w.id)?.n ?? 0) + 1 });
    if (BIG.test(w.team)) bigWinners++;
    if (rs.slice(0, 3).some((a) => a.id === seasonTop.id)) topSeasonInTop3++;
    roundRows.push(`| ${r} | ${w.name} (${w.team}) | ${w.points} | ${rs[9] ? rs[9].points : '–'} |`);
  }
  const repeat = [...winners.values()].sort((a, b) => b.n - a.n)[0];
  say(`- **${winners.size} different players** were the round's best in ${roundRows.length} rounds (most often: ${repeat?.name}, ${repeat?.n}×).`);
  say(`- The round's best player came from the big four in **${pct(bigWinners, roundRows.length)}%** of rounds.`);
  say(`- The season's top scorer (${seasonTop.name}) was in a round's top 3 in ${topSeasonInTop3} of ${roundRows.length} rounds.`);
  say();
  say('| Round | Best player | Points | 10th best |');
  say('|---|---|---|---|');
  roundRows.forEach((row) => say(row));

  // 5. Rotation
  const stars = players.slice(0, 30);
  const clubMatches = (teamId) => clubs.get(teamId)?.matches ?? 0;
  const starRows = stars.map((p) => {
    const cm = clubMatches(p.teamId);
    return { ...p, cm, under60: cm - p.sixty };
  });
  const avgUnder = sum(starRows.map((p) => pct(p.under60, p.cm))) / (starRows.length || 1);
  say();
  say('## 5. How often do stars miss out?');
  say();
  say(`The top 30 players played under 60 minutes (or not at all) in **${Math.round(avgUnder)}%** of their club's matches on average.`);
  say();
  say('| Player | Club | Pos | Points | Club matches | 60+ min | Under 60 / absent |');
  say('|---|---|---|---|---|---|---|');
  for (const p of starRows.slice(0, 15)) {
    say(`| ${p.name} | ${p.team} | ${p.pos} | ${r1(p.points)} | ${p.cm} | ${p.sixty} | ${p.under60} (${pct(p.under60, p.cm)}%) |`);
  }

  // 6. Cards
  const yellows = sum(apps.map((a) => (a.line.red ? 0 : a.line.yellow)));
  const reds = sum(apps.map((a) => a.line.red));
  say();
  say('## 6. Cards');
  say();
  say(`${r1(yellows / matches.length)} yellow and ${(reds / matches.length).toFixed(2)} red cards per match. Cards cost ${pct(yellows + reds * 3, totalPts)}% of all points scored.`);

  // 7. Pricing: two candidate rules, priced on the first half and tested on the second
  say();
  say('## 7. Pricing: two candidate rules');
  say();
  comparePricing(say, apps, players, rounds);

  say();
  say('---');
  say('Scoring: `src/scoring.mjs` version 1. Outfield clean sheets use the team’s goals conceded for the whole match.');
}

// Two candidate pricing rules, set before the replay's first round from the first half and
// tested against the second half. Works on whatever rounds are imported, in order.
//   Rule A: target = 4.0 + 0.9 × form, between 4.0 and 13.5
//           (form = average points over the club's last 6 matches, 0 when he did not play)
//   Rule B: rank within position by points per club match so far, mapped onto a range
//           (KL 4.0–6.0, DF 4.0–7.0, OS 4.5–11.5, FV 4.5–11.5; the price curve rises steeply at the top)
// After the start, every price moves toward its rule's target by at most ±0.3 a round.
const PRICE_START_ROUND = Number(process.env.START_ROUND || 20);
const RANGES = { KL: [4.0, 6.0], DF: [4.0, 7.0], OS: [4.5, 11.5], FV: [4.5, 11.5] };
const SQUAD = { KL: 2, DF: 5, OS: 5, FV: 3 };
const BUDGET = 100;

function comparePricing(say, apps, players, rounds) {
  const first = rounds.filter((r) => r < PRICE_START_ROUND);
  const second = rounds.filter((r) => r >= PRICE_START_ROUND);
  if (first.length < 4 || second.length < 3) {
    say(`Not enough rounds yet: needs 4 before round ${PRICE_START_ROUND} and 3 after it.`);
    return;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const tenth = (x) => Math.round(x * 10) / 10;
  const half = (x) => Math.round(x * 2) / 2;
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  const clubRounds = new Map();
  for (const a of apps) {
    if (!clubRounds.has(a.teamId)) clubRounds.set(a.teamId, new Set());
    clubRounds.get(a.teamId).add(a.round);
  }
  const pointsIn = new Map(apps.map((a) => [`${a.id}:${a.round}`, a.points]));
  const clubRoundsBefore = (p, r) => [...(clubRounds.get(p.teamId) ?? [])].filter((x) => x < r).sort((a, b) => b - a);
  const pointsOver = (p, rs) => sum(rs.map((x) => pointsIn.get(`${p.id}:${x}`) ?? 0));
  // Prices for round r only know rounds before r
  const form = (p, r) => {
    const rs = clubRoundsBefore(p, r).slice(0, 6);
    return rs.length ? pointsOver(p, rs) / rs.length : 0;
  };
  const toDate = (p, r) => {
    const rs = clubRoundsBefore(p, r);
    return rs.length ? pointsOver(p, rs) / rs.length : 0;
  };
  const playedBefore = (p, r) => apps.some((a) => a.id === p.id && a.round < r && a.minutes > 0);

  const ruleA = (r) => new Map(players.map((p) => [p.id, clamp(4.0 + 0.9 * form(p, r), 4.0, 13.5)]));
  const ruleB = (r) => {
    const out = new Map();
    for (const [pos, [lo, hi]] of Object.entries(RANGES)) {
      const group = players.filter((p) => p.pos === pos);
      const ranked = group.filter((p) => playedBefore(p, r)).map((p) => ({ p, v: toDate(p, r) })).sort((a, b) => a.v - b.v);
      ranked.forEach(({ p }, i) => out.set(p.id, lo + (hi - lo) * (ranked.length > 1 ? i / (ranked.length - 1) : 0) ** 2));
      for (const p of group) if (!out.has(p.id)) out.set(p.id, lo);
    }
    return out;
  };

  // Second-half value: points per club match after the start (0 when he did not play)
  const secondValue = (p) => {
    const rs = [...(clubRounds.get(p.teamId) ?? [])].filter((x) => x >= PRICE_START_ROUND);
    return rs.length ? pointsOver(p, rs) / rs.length : null;
  };
  const firstPoints = (p) => pointsOver(p, first);

  // Best 15 by a value, 2/5/5/3 and at most 3 per club
  const best15 = (value) => {
    const left = { ...SQUAD };
    const perClub = new Map();
    const squad = [];
    for (const p of [...players].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1))) {
      if (!left[p.pos] || (perClub.get(p.teamId) ?? 0) >= 3) continue;
      left[p.pos]--;
      perClub.set(p.teamId, (perClub.get(p.teamId) ?? 0) + 1);
      squad.push(p);
      if (squad.length === 15) break;
    }
    return squad;
  };

  // Spearman rank correlation, average ranks for ties
  const ranks = (xs) => {
    const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(xs.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return out;
  };
  const spearman = (xs, ys) => {
    const rx = ranks(xs);
    const ry = ranks(ys);
    const mx = sum(rx) / rx.length;
    const my = sum(ry) / ry.length;
    const cov = sum(rx.map((x, i) => (x - mx) * (ry[i] - my)));
    const sx = Math.sqrt(sum(rx.map((x) => (x - mx) ** 2)));
    const sy = Math.sqrt(sum(ry.map((y) => (y - my) ** 2)));
    return sx && sy ? cov / (sx * sy) : 0;
  };

  const pool = players.filter((p) => playedBefore(p, PRICE_START_ROUND) && secondValue(p) != null);
  const bestFirst = best15(firstPoints);
  const bestSecond = best15(secondValue);

  const evaluate = (name, rule, round) => {
    const start = new Map([...rule(PRICE_START_ROUND)].map(([id, v]) => [id, round(v)]));
    const price = new Map(start);
    const moves = new Map(players.map((p) => [p.id, 0]));
    for (const r of second.slice(1)) {
      const target = rule(r);
      for (const p of players) {
        const now = price.get(p.id);
        const next = tenth(now + clamp(target.get(p.id) - now, -0.3, 0.3));
        if (next !== now) moves.set(p.id, moves.get(p.id) + 1);
        price.set(p.id, next);
      }
    }
    const byPos = Object.fromEntries(
      Object.keys(RANGES).map((pos) => {
        const xs = pool.filter((p) => p.pos === pos).map((p) => start.get(p.id));
        return [pos, `${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)} (${median(xs).toFixed(1)})`];
      }),
    );
    const cost = (squad) => sum(squad.map((p) => start.get(p.id)));
    const changes = pool.map((p) => ({ p, from: start.get(p.id), to: price.get(p.id) }));
    return {
      name,
      byPos,
      costFirst: cost(bestFirst),
      costSecond: cost(bestSecond),
      corr: spearman(pool.map((p) => start.get(p.id)), pool.map(secondValue)),
      moves: sum(pool.map((p) => moves.get(p.id))) / pool.length,
      risers: [...changes].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 5),
      fallers: [...changes].sort((a, b) => a.to - a.from - (b.to - b.from)).slice(0, 5),
    };
  };

  const A = evaluate('Rule A · 4.0 + 0.9 × form', ruleA, tenth);
  const B = evaluate('Rule B · ranked within position', ruleB, half);

  say(
    `Prices are set before round ${PRICE_START_ROUND} from imported rounds ${first.join(', ')}, then tested on rounds ${second.join(', ')}. ` +
      `${pool.length} players played in both halves. Budget: ${BUDGET} credits for 15 players.`,
  );
  say();
  say(`| | ${A.name} | ${B.name} |`);
  say('|---|---|---|');
  for (const pos of Object.keys(RANGES)) say(`| ${pos} price range (median) | ${A.byPos[pos]} | ${B.byPos[pos]} |`);
  say(`| Best 15 of the first half costs | ${r1(A.costFirst)} | ${r1(B.costFirst)} |`);
  say(`| Best 15 of the second half costs (hindsight) | ${r1(A.costSecond)} | ${r1(B.costSecond)} |`);
  say(`| Price → second-half points per match (rank correlation, 1 = perfect) | ${A.corr.toFixed(2)} | ${B.corr.toFixed(2)} |`);
  say(`| Price changes per player over the second half (±0.3 a round) | ${r1(A.moves)} | ${r1(B.moves)} |`);
  say();
  say('A good rule: the best squads cost well over the budget (so choices matter), and prices predict later points.');
  for (const R of [A, B]) {
    say();
    say(`${R.name}: biggest risers and fallers over the second half`);
    say();
    say('| Player | Club | Pos | Start | End | Change |');
    say('|---|---|---|---|---|---|');
    for (const { p, from, to } of [...R.risers, ...R.fallers]) {
      const d = to - from;
      say(`| ${p.name} | ${p.team} | ${p.pos} | ${from.toFixed(1)} | ${to.toFixed(1)} | ${(d >= 0 ? '+' : '') + d.toFixed(1)} |`);
    }
  }
  if (rounds.length < rounds[rounds.length - 1]) {
    say();
    say(`Note: only ${second.length} second-half rounds are imported, so prices move ${second.length - 1} times here instead of every round.`);
  }
}

const lines = [];
const say = (s = '') => lines.push(s);
try {
  main(say, await load());
} catch (err) {
  say(`# Season analysis failed\n\n${err.message}`);
  console.error(err);
  process.exitCode = 1;
}
const report = lines.join('\n') + '\n';
await mkdir('reports', { recursive: true });
await writeFile(`reports/season-${SEASON}.md`, report);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
console.log(report);
