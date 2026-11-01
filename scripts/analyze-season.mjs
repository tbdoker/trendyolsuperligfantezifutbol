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

  // 7. Pricing simulation (needs most of the season in order)
  say();
  say('## 7. Performance-based prices: simulation');
  say();
  if (rounds.length < 20 || rounds.length < rounds[rounds.length - 1] * 0.8) {
    say('Waiting for the full season: the simulation needs the rounds in order.');
  } else {
    simulatePrices(say, apps, players, rounds, clubs);
  }

  say();
  say('---');
  say('Scoring: `src/scoring.mjs` version 1. Outfield clean sheets use the team’s goals conceded for the whole match.');
}

// First draft of the pricing rule:
//   form   = average points over the player's club's last 6 matches (0 when he did not play)
//   target = 4.0 + 0.9 × form, between 4.0 and 13.5
//   price moves toward target by at most ±0.3 a round, in steps of 0.1
// Prices start from the target after the first 6 rounds.
function simulatePrices(say, apps, players, rounds, clubs) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const target = (form) => clamp(4.0 + 0.9 * form, 4.0, 13.5);
  const clubRounds = new Map();
  for (const a of apps) {
    const set = clubRounds.get(a.teamId) ?? new Set();
    set.add(a.round);
    clubRounds.set(a.teamId, set);
  }
  const pointsIn = new Map(apps.map((a) => [`${a.id}:${a.round}`, a.points]));
  const formAt = (p, r) => {
    const rs = [...(clubRounds.get(p.teamId) ?? [])].filter((x) => x <= r).sort((a, b) => b - a).slice(0, 6);
    return rs.length ? sum(rs.map((x) => pointsIn.get(`${p.id}:${x}`) ?? 0)) / rs.length : 0;
  };
  const pool = players.filter((p) => p.apps >= 5);
  const start = rounds[5];
  const prices = new Map(pool.map((p) => [p.id, { start: 0, price: 0, moves: 0 }]));
  for (const p of pool) {
    const v = Math.round(target(formAt(p, start)) * 10) / 10;
    Object.assign(prices.get(p.id), { start: v, price: v });
  }
  for (const r of rounds.filter((x) => x > start)) {
    for (const p of pool) {
      const s = prices.get(p.id);
      const step = clamp(target(formAt(p, r)) - s.price, -0.3, 0.3);
      const next = Math.round((s.price + step) * 10) / 10;
      if (next !== s.price) s.moves++;
      s.price = next;
    }
  }
  const rows = pool.map((p) => ({ ...p, ...prices.get(p.id) }));
  const fmt = (p) => `| ${p.name} | ${p.team} | ${p.pos} | ${p.start.toFixed(1)} | ${p.price.toFixed(1)} | ${(p.price - p.start >= 0 ? '+' : '') + (p.price - p.start).toFixed(1)} |`;
  say(`${pool.length} players with 5+ appearances, from round ${start}. Average price changes per player: ${r1(sum(rows.map((p) => p.moves)) / rows.length)}.`);
  say();
  say('Most expensive at the end:');
  say();
  say('| Player | Club | Pos | Start | End | Change |');
  say('|---|---|---|---|---|---|');
  rows.sort((a, b) => b.price - a.price).slice(0, 10).forEach((p) => say(fmt(p)));
  say();
  say('Biggest risers:');
  say();
  say('| Player | Club | Pos | Start | End | Change |');
  say('|---|---|---|---|---|---|');
  rows.sort((a, b) => b.price - b.start - (a.price - a.start)).slice(0, 8).forEach((p) => say(fmt(p)));
  say();
  say('Biggest fallers:');
  say();
  say('| Player | Club | Pos | Start | End | Change |');
  say('|---|---|---|---|---|---|');
  rows.sort((a, b) => a.price - a.start - (b.price - b.start)).slice(0, 8).forEach((p) => say(fmt(p)));
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
