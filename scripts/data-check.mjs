// Data check: does API-Football give us the Süper Lig player stats our scoring needs?
// Run on GitHub Actions (see .github/workflows/data-check.yml) or locally:
//   APIFOOTBALL_KEY=... node scripts/data-check.mjs
// Uses about 12 requests of the free plan's 100 per day.

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { scoreLine, matchBonus, fromApiFootball } from '../src/scoring.mjs';

const KEY = process.env.APIFOOTBALL_KEY;
const LAST = Math.min(Number(process.env.LAST || 9), 20);
const SEASON_OVERRIDE = process.env.SEASON ? Number(process.env.SEASON) : null;
const BASE = 'https://v3.football.api-sports.io';
const OUT = 'out';

if (!KEY) {
  console.error('APIFOOTBALL_KEY is not set. Add it as a repository secret.');
  process.exit(1);
}

let calls = 0;
let lastCall = 0;

class ApiError extends Error {}

// The free plan allows about 10 requests a minute, so keep requests ~6.5 s apart.
const GAP_MS = 6500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, params = {}, retried = false) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const since = Date.now() - lastCall;
  if (since < GAP_MS) await wait(GAP_MS - since);
  lastCall = Date.now();
  calls++;
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
  if (res.status === 429 && !retried) {
    await wait(61000);
    return api(path, params, true);
  }
  if (!res.ok) throw new ApiError(`${path}: HTTP ${res.status}`);
  const body = await res.json();
  const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors || {});
  if (errors.length) throw new ApiError(`${path}: ${errors.join(' | ')}`);
  return body;
}

async function save(name, data) {
  await mkdir(`${OUT}/raw`, { recursive: true });
  await writeFile(`${OUT}/raw/${name}.json`, JSON.stringify(data, null, 2));
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const pts = (x) => (x > 0 ? `+${x}` : `${x}`);

// Stats our scoring uses, where API-Football keeps them, and who they apply to.
const FIELDS = [
  ['games.minutes', 'Minutes', 'Süre', 'all'],
  ['games.rating', 'Match rating', 'Maçın yıldızı bonusu', 'all'],
  ['goals.total', 'Goals', 'Gol', 'all'],
  ['goals.assists', 'Assists', 'Asist', 'all'],
  ['passes.key', 'Key passes', 'Pozisyon yarattı', 'all'],
  ['shots.on', 'Shots on target', 'İsabetli şut', 'all'],
  ['tackles.total', 'Tackles', 'Top kazanma', 'all'],
  ['tackles.interceptions', 'Interceptions', 'Araya girme', 'all'],
  ['tackles.blocks', 'Blocks', 'Şut bloğu', 'all'],
  ['goals.saves', 'Saves', 'Kurtarış', 'gk'],
  ['goals.conceded', 'Goals conceded', 'Yenilen gol', 'gk'],
  ['penalty.won', 'Penalties won', 'Penaltı kazandırdı', 'all'],
  ['penalty.saved', 'Penalties saved', 'Penaltı kurtardı', 'gk'],
  ['penalty.missed', 'Penalties missed', 'Penaltı kaçırdı', 'all'],
  ['cards.yellow', 'Yellow cards', 'Sarı kart', 'all'],
  ['cards.red', 'Red cards', 'Kırmızı kart', 'all'],
];

async function main() {
  const lines = [];
  const say = (s = '') => lines.push(s);

  // 1. Plan and quota (no personal account details)
  const status = await api('/status');
  const sub = status.response?.subscription ?? {};
  const req = status.response?.requests ?? {};
  say('# Süper Lig data check');
  say();
  say(`Plan: **${sub.plan ?? 'unknown'}** · requests today before this run: ${req.current ?? '?'} / ${req.limit_day ?? '?'}`);

  // 2. Find the Süper Lig and its current season
  const leagues = await api('/leagues', { country: 'Turkey', type: 'league' });
  await save('leagues', leagues);
  const entry = leagues.response.find((l) => /s[üu]per lig/i.test(l.league.name));
  if (!entry) throw new ApiError('Could not find the Süper Lig in /leagues?country=Turkey');
  const leagueId = entry.league.id;
  const current = entry.seasons.find((s) => s.current) ?? entry.seasons[entry.seasons.length - 1];
  let season = SEASON_OVERRIDE ?? current.year;
  const cov = current.coverage?.fixtures ?? {};
  say(`League: **${entry.league.name}** (id ${leagueId}) · current season ${current.year}`);
  say(
    `API coverage flags for ${current.year}: player stats ${cov.statistics_players ? 'yes' : 'no'}, ` +
      `events ${cov.events ? 'yes' : 'no'}, lineups ${cov.lineups ? 'yes' : 'no'}`,
  );

  // 3. Recent finished matches. The free plan has no "last N" filter, so we take the whole
  //    season's fixture list (one request) and pick the newest finished matches ourselves.
  //    The free plan may also block the current season; if so, fall back to the newest season
  //    it allows so we can still check which stats exist.
  let fixtures;
  try {
    fixtures = await api('/fixtures', { league: leagueId, season });
  } catch (err) {
    const years = (String(err.message).match(/20\d\d/g) || []).map(Number);
    if (!/season/i.test(err.message) || !years.length) throw err;
    say();
    say(`> **The plan blocked season ${season}:** ${err.message}`);
    season = Math.max(...years);
    say(`> Falling back to season ${season} to check which stats exist.`);
    fixtures = await api('/fixtures', { league: leagueId, season });
  }
  await save('fixtures', fixtures);
  const finished = fixtures.response
    .filter((f) => ['FT', 'AET', 'PEN'].includes(f.fixture.status.short))
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, LAST);
  say();
  say(`## ${finished.length} finished matches checked (season ${season})`);
  say();
  for (const f of finished) {
    say(`- ${f.fixture.date.slice(0, 10)} · ${f.teams.home.name} ${f.goals.home}–${f.goals.away} ${f.teams.away.name} (round: ${f.league.round})`);
  }

  // 4. Player stats for each match, then our scoring
  const scored = [];
  const tracked = Object.fromEntries(FIELDS.map(([p]) => [p, { matches: 0, players: 0, eligible: 0 }]));
  for (const f of finished) {
    const body = await api('/fixtures/players', { fixture: f.fixture.id });
    await save(`players-${f.fixture.id}`, body);
    const inMatch = [];
    const seenInMatch = new Set();
    for (const side of body.response) {
      const home = side.team.id === f.teams.home.id;
      const teamConceded = home ? f.goals.away : f.goals.home;
      for (const p of side.players) {
        const s = p.statistics?.[0];
        if (!s || !(s.games?.minutes > 0)) continue;
        const isGk = s.games.position === 'G';
        for (const [path, , , who] of FIELDS) {
          if (who === 'gk' && !isGk) continue;
          tracked[path].eligible++;
          if (get(s, path) != null) {
            tracked[path].players++;
            seenInMatch.add(path);
          }
        }
        const line = fromApiFootball(s, { teamConceded });
        const rating = s.games.rating != null ? Number(s.games.rating) : null;
        inMatch.push({ id: p.player.id, name: p.player.name, club: side.team.name, rating, line });
      }
    }
    for (const path of seenInMatch) tracked[path].matches++;
    const bonus = matchBonus(inMatch);
    for (const p of inMatch) {
      p.line.bonus = bonus.get(p.id) ?? 0;
      scored.push({ ...p, result: scoreLine(p.line) });
    }
  }

  // 5. Which stats exist
  say();
  say('## Which stats we get');
  say();
  say('"Matches tracked" means at least one player had a value in that match. API-Football often');
  say('sends null instead of 0, so a low player percentage alone does not mean the stat is missing.');
  say();
  say('| Stat | Used for | Matches tracked | Players with a value | Verdict |');
  say('|---|---|---|---|---|');
  for (const [path, label, usedFor, who] of FIELDS) {
    const t = tracked[path];
    const share = finished.length ? t.matches / finished.length : 0;
    const verdict = share >= 0.8 ? 'OK' : share > 0 ? 'Partial' : 'Missing';
    const pct = t.eligible ? Math.round((t.players / t.eligible) * 100) : 0;
    say(`| ${label}${who === 'gk' ? ' (GK)' : ''} | ${usedFor} | ${t.matches}/${finished.length} | ${pct}% | ${verdict} |`);
  }

  // 6. Top players of these matches with our scoring
  scored.sort((a, b) => b.result.total - a.result.total);
  say();
  say('## Top 15 with our scoring');
  say();
  say('| # | Player | Club | Pos | Min | Points | Breakdown |');
  say('|---|---|---|---|---|---|---|');
  scored.slice(0, 15).forEach((p, i) => {
    const breakdown = p.result.rows.map((r) => `${r.label} ${pts(r.points)}`).join(', ');
    say(`| ${i + 1} | ${p.name} | ${p.club} | ${p.line.pos} | ${p.line.minutes} | ${p.result.total} | ${breakdown} |`);
  });
  if (scored.length) {
    const avg = scored.reduce((s, p) => s + p.result.total, 0) / scored.length;
    say();
    say(`Players scored: ${scored.length} · average ${avg.toFixed(1)} points per player who played.`);
  }

  say();
  say('## Not covered yet');
  say();
  say('- Own goals: not in player stats; needs /fixtures/events (one extra request per match).');
  say('- Errors leading to a goal: API-Football does not provide this.');
  say('- Outfield clean sheets use the team’s goals conceded for the whole match, not just while the player was on.');
  say();
  say(`Requests used by this run: ${calls}.`);

  const report = lines.join('\n');
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/report.md`, report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  console.log(report);
}

main().catch(async (err) => {
  const msg = `# Süper Lig data check failed\n\n${err.message}\n\nRequests used: ${calls}.`;
  console.error(msg);
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/report.md`, msg);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, msg + '\n');
  process.exit(1);
});
