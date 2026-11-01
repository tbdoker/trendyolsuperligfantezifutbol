// Import a full Süper Lig season, a little at a time.
// Each run uses at most BUDGET requests and skips matches it already has, so a daily job
// fills in the whole season over a few days on the free plan.
//
// Saved locally under data/<season>/ (never committed; the repository is public):
//   fixtures.json        every fixture of the season, compact
//   matches/<id>.json    one finished match: fixture info + normalized player stat lines
//
//   APIFOOTBALL_KEY=... SEASON=2024 BUDGET=90 node scripts/import-season.mjs

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createClient } from './lib/api.mjs';
import { fromApiFootball } from '../src/scoring.mjs';

const SEASON = Number(process.env.SEASON || 2024);
const LEAGUE = Number(process.env.LEAGUE || 203); // Süper Lig on API-Football
const BUDGET = Number(process.env.BUDGET || 90);
const DIR = `data/${SEASON}`;
const FINISHED = ['FT', 'AET', 'PEN'];

const api = createClient({ key: process.env.APIFOOTBALL_KEY, budget: BUDGET, gapMs: Number(process.env.GAP_MS ?? 6500) });

const roundNo = (label) => Number(String(label).match(/(\d+)\s*$/)?.[1] ?? 0);

function compactFixture(f) {
  return {
    id: f.fixture.id,
    date: f.fixture.date,
    timestamp: f.fixture.timestamp,
    status: f.fixture.status.short,
    round: roundNo(f.league.round),
    home: { id: f.teams.home.id, name: f.teams.home.name, goals: f.goals.home },
    away: { id: f.teams.away.id, name: f.teams.away.name, goals: f.goals.away },
  };
}

function compactMatch(fixture, body) {
  const players = [];
  for (const side of body.response) {
    const isHome = side.team.id === fixture.home.id;
    const teamConceded = isHome ? fixture.away.goals : fixture.home.goals;
    for (const p of side.players) {
      const s = p.statistics?.[0];
      if (!s) continue;
      players.push({
        id: p.player.id,
        name: p.player.name,
        teamId: side.team.id,
        team: side.team.name,
        substitute: !!s.games?.substitute,
        rating: s.games?.rating != null ? Number(s.games.rating) : null,
        line: fromApiFootball(s, { teamConceded }),
      });
    }
  }
  return { fixture, players };
}

// Fetch matches spread across the season first (rounds 1, 6, 11, …), so even a partial
// import gives a fair picture of the whole season.
const spread = (a, b) => (a.round - 1) % 5 - (b.round - 1) % 5 || a.round - b.round || a.timestamp - b.timestamp;

async function main() {
  await mkdir(`${DIR}/matches`, { recursive: true });

  let fixtures;
  if (existsSync(`${DIR}/fixtures.json`)) {
    fixtures = JSON.parse(await readFile(`${DIR}/fixtures.json`, 'utf8'));
  } else {
    const body = await api.get('/fixtures', { league: LEAGUE, season: SEASON });
    fixtures = body.response.map(compactFixture);
    await writeFile(`${DIR}/fixtures.json`, JSON.stringify(fixtures));
  }

  const finished = fixtures.filter((f) => FINISHED.includes(f.status));
  const have = new Set((await readdir(`${DIR}/matches`)).map((f) => Number(f.replace('.json', ''))));
  const todo = finished.filter((f) => !have.has(f.id)).sort(spread);

  let added = 0;
  let stopped = null;
  for (const f of todo) {
    if (api.left < 1) break;
    try {
      const body = await api.get('/fixtures/players', { fixture: f.id });
      await writeFile(`${DIR}/matches/${f.id}.json`, JSON.stringify(compactMatch(f, body)));
      added++;
    } catch (err) {
      stopped = err.message; // keep what we have; the next run continues from here
      break;
    }
  }

  const total = have.size + added;
  console.log(`Season ${SEASON}: ${total}/${finished.length} finished matches saved (+${added} this run, ${api.calls} requests).`);
  if (stopped) console.log(`Stopped early: ${stopped}`);
  if (total >= finished.length) console.log('Season complete.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
