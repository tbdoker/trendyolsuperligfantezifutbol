// Turns an imported season (data/<season>/) into SQL files for Supabase (out/sync/*.sql).
// The Import season workflow runs them with `supabase db query --linked -f`.
//
// Public tables get clubs, players, positions, provisional prices, rounds and fixtures without
// results. Results and scored stat lines go to the private replay schema; the season clock
// (replay.setup / open_round / reveal_round) decides when they become public.
//
//   SEASON=2024 START_ROUND=20 node scripts/sync-supabase.mjs

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { matchBonus, scoreLine } from '../src/scoring.mjs'

const SEASON = Number(process.env.SEASON || 2024)
const START_ROUND = Number(process.env.START_ROUND || 20) // prices use only the rounds before this
const DIR = `data/${SEASON}`
const OUT = 'out/sync'
const MAX_FILE_BYTES = 400_000 // keep each request to the management API small
const TAG = '$tribun_json$'

// Club codes and colors (no logos). Matched on the name without accents.
const CLUBS = [
  [/galatasaray/, 'GS', 'Galatasaray', '#A90432', '#FDB912'],
  [/fenerbahce/, 'FB', 'Fenerbahçe', '#0B1E4B', '#FFED00'],
  [/besiktas/, 'BJK', 'Beşiktaş', '#111111', '#F5F5F5'],
  [/trabzon/, 'TS', 'Trabzonspor', '#8A1538', '#6CACE4'],
  [/basaksehir/, 'BŞK', 'Başakşehir', '#ED6B1E', '#1B2A4A'],
  [/goztepe/, 'GÖZ', 'Göztepe', '#FFD100', '#D6001C'],
  [/samsun/, 'SAM', 'Samsunspor', '#E30613', '#F5F5F5'],
  [/kasimpasa/, 'KAS', 'Kasımpaşa', '#0C2A5B', '#F5F5F5'],
  [/rize/, 'RİZ', 'Çaykur Rizespor', '#00843D', '#1F5FAD'],
  [/gaziantep/, 'GFK', 'Gaziantep FK', '#C8102E', '#111111'],
  [/alanya/, 'ALY', 'Alanyaspor', '#F28C00', '#00843D'],
  [/konya/, 'KON', 'Konyaspor', '#00843D', '#F5F5F5'],
  [/kayseri/, 'KAY', 'Kayserispor', '#E30A17', '#FFD100'],
  [/antalya/, 'ANT', 'Antalyaspor', '#E30A17', '#F5F5F5'],
  [/sivas/, 'SİV', 'Sivasspor', '#E30A17', '#F5F5F5'],
  [/eyup/, 'EYÜ', 'Eyüpspor', '#6A2C91', '#FDB912'],
  [/bodrum/, 'BOD', 'Bodrumspor', '#00843D', '#F5F5F5'],
  [/hatay/, 'HTY', 'Hatayspor', '#7A1F2B', '#F5F5F5'],
  [/adana demir/, 'ADS', 'Adana Demirspor', '#1B3A6B', '#6CACE4'],
  [/kocaeli/, 'KOC', 'Kocaelispor', '#00843D', '#111111'],
  [/genclerbirligi/, 'GEN', 'Gençlerbirliği', '#E30613', '#111111'],
  [/karagumruk/, 'KRG', 'Fatih Karagümrük', '#E30613', '#111111'],
  [/amed/, 'AMD', 'Amedspor', '#00843D', '#E30A17'],
  [/corum/, 'ÇOR', 'Çorum FK', '#D50000', '#111111'],
  [/erzurum/, 'ERZ', 'Erzurumspor', '#0055A4', '#F5F5F5'],
]

// Provisional price range per position (credits), until the pricing rule is decided.
const PRICE_RANGE = { KL: [4.0, 6.0], DF: [4.0, 7.0], OS: [4.5, 11.5], FV: [4.5, 11.5] }

const plain = (s) =>
  s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')

function clubInfo(id, name) {
  const hit = CLUBS.find(([re]) => re.test(plain(name)))
  if (hit) return { id, name: hit[2], short_code: hit[1], color_primary: hit[3], color_secondary: hit[4] }
  return { id, name, short_code: plain(name).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase(), color_primary: null, color_secondary: null }
}

const shortName = (name) => name.trim().split(/\s+/).pop()
const half = (x) => Math.round(x * 2) / 2

function json(value) {
  const text = JSON.stringify(value)
  if (text.includes(TAG)) throw new Error('Data contains the SQL quoting tag')
  return `${TAG}${text}${TAG}::jsonb`
}

async function load() {
  const fixtures = JSON.parse(await readFile(`${DIR}/fixtures.json`, 'utf8'))
  const matches = []
  for (const f of await readdir(`${DIR}/matches`)) {
    if (f.endsWith('.json')) matches.push(JSON.parse(await readFile(`${DIR}/matches/${f}`, 'utf8')))
  }
  matches.sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
  return { fixtures, matches }
}

function build({ fixtures, matches }) {
  // Clubs, from the fixture list
  const clubs = new Map()
  for (const f of fixtures) {
    for (const side of [f.home, f.away]) if (!clubs.has(side.id)) clubs.set(side.id, clubInfo(side.id, side.name))
  }

  // Score every appearance; collect players with their positions and latest club
  const players = new Map()
  const lines = []
  for (const m of matches) {
    const played = m.players.filter((p) => p.line.minutes > 0)
    const bonus = matchBonus(played)
    for (const p of m.players) {
      let pl = players.get(p.id)
      if (!pl) {
        pl = { id: p.id, name: p.name, positions: {}, listedAs: p.line.pos, club: p.teamId, points: 0, appearances: 0 }
        players.set(p.id, pl)
      }
      pl.club = p.teamId // matches are in date order, so this ends as his latest club
      pl.listedAs = p.line.pos
      if (p.line.minutes <= 0) continue // an unused substitute scores nothing

      const line = { ...p.line, bonus: bonus.get(p.id) ?? 0 }
      const result = scoreLine(line)
      lines.push({
        fixture_id: m.fixture.id,
        player_id: p.id,
        club_id: p.teamId,
        position: line.pos,
        minutes: line.minutes,
        rating: p.rating,
        stats: line,
        points: result.total,
        breakdown: result.rows,
        round: m.fixture.round,
      })
      pl.positions[line.pos] = (pl.positions[line.pos] ?? 0) + 1
      if (m.fixture.round < START_ROUND) {
        pl.points += result.total
        pl.appearances++
      }
    }
  }
  // His most common position when he played; otherwise the one the squad list gives him
  for (const pl of players.values()) {
    const counted = Object.entries(pl.positions).sort((a, b) => b[1] - a[1])
    pl.position = counted[0]?.[0] ?? pl.listedAs ?? null
  }

  // Provisional prices: points per club match before START_ROUND, ranked within each position
  const clubMatches = new Map()
  for (const m of matches) {
    if (m.fixture.round >= START_ROUND) continue
    for (const side of [m.fixture.home, m.fixture.away]) clubMatches.set(side.id, (clubMatches.get(side.id) ?? 0) + 1)
  }
  const priced = [...players.values()].filter((p) => p.position)
  for (const pos of Object.keys(PRICE_RANGE)) {
    const [lo, hi] = PRICE_RANGE[pos]
    const group = priced.filter((p) => p.position === pos)
    for (const p of group) p.value = p.appearances ? p.points / Math.max(1, clubMatches.get(p.club) ?? 1) : 0
    const ranked = group.filter((p) => p.appearances).sort((a, b) => a.value - b.value)
    ranked.forEach((p, i) => {
      const pct = ranked.length > 1 ? i / (ranked.length - 1) : 0
      p.price = half(lo + (hi - lo) * pct ** 2)
    })
    for (const p of group) if (p.price == null) p.price = lo
  }

  return { clubs: [...clubs.values()], players: priced, lines, fixtures }
}

function baseSql({ clubs, players, fixtures }) {
  const rounds = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b)
  const clubsJson = json(clubs)
  const playerRows = players.map((p) => ({
    id: p.id,
    name: p.name,
    short_name: shortName(p.name),
    club_id: p.club,
    position: p.position,
    price: p.price,
  }))
  const fixtureRows = fixtures.map((f) => ({
    id: f.id,
    round: f.round,
    home: f.home.id,
    away: f.away.id,
    kickoff: f.date,
    home_goals: f.home.goals,
    away_goals: f.away.goals,
  }))
  const played = fixtureRows.filter((f) => f.home_goals != null)

  return `-- Generated by scripts/sync-supabase.mjs: season ${SEASON}, ${clubs.length} clubs, ${players.length} players, ${fixtures.length} fixtures
insert into seasons (id, name, is_current) values (${SEASON}, '${SEASON}–${String(SEASON + 1).slice(2)}', false)
on conflict (id) do nothing;

insert into clubs (id, name, short_code, color_primary, color_secondary)
select id, name, short_code, color_primary, color_secondary
from jsonb_to_recordset(${clubsJson}) as x(id integer, name text, short_code text, color_primary text, color_secondary text)
on conflict (id) do update set name = excluded.name, short_code = excluded.short_code,
  color_primary = excluded.color_primary, color_secondary = excluded.color_secondary;

insert into rounds (season_id, number)
select ${SEASON}, n::integer from jsonb_array_elements_text(${json(rounds)}) n
on conflict (season_id, number) do nothing;

insert into players (id, name, short_name)
select id, name, short_name from jsonb_to_recordset(${json(playerRows)}) as x(id integer, name text, short_name text)
on conflict (id) do update set name = excluded.name, short_name = excluded.short_name;

-- Prices refresh on every sync until the replay's first round is opened
insert into player_seasons (player_id, season_id, club_id, position, price)
select id, ${SEASON}, club_id, position::player_position, price
from jsonb_to_recordset(${json(playerRows)}) as x(id integer, club_id integer, position text, price numeric)
on conflict (player_id, season_id) do update set
  club_id = excluded.club_id,
  position = excluded.position,
  price = case when exists (select 1 from rounds where season_id = ${SEASON} and deadline_at is not null)
               then player_seasons.price else excluded.price end;

-- Fixtures arrive hidden: no kickoff, no result. The season clock reveals them.
insert into fixtures (id, season_id, round_id, home_club_id, away_club_id, kickoff_at, status)
select x.id, ${SEASON}, r.id, x.home, x.away, null, 'scheduled'
from jsonb_to_recordset(${json(fixtureRows)}) as x(id integer, round integer, home integer, away integer)
join rounds r on r.season_id = ${SEASON} and r.number = x.round
on conflict (id) do nothing;

insert into replay.fixtures (fixture_id, original_kickoff, home_goals, away_goals)
select id, kickoff, home_goals, away_goals
from jsonb_to_recordset(${json(played)}) as x(id integer, kickoff timestamptz, home_goals smallint, away_goals smallint)
on conflict (fixture_id) do update set original_kickoff = excluded.original_kickoff,
  home_goals = excluded.home_goals, away_goals = excluded.away_goals;
`
}

function statsSql(rows) {
  return `insert into replay.match_stats (fixture_id, player_id, club_id, position, minutes, rating, stats, points, breakdown)
select fixture_id, player_id, club_id, position::player_position, minutes, rating, stats, points, breakdown
from jsonb_to_recordset(${json(rows)}) as x(fixture_id integer, player_id integer, club_id integer, position text,
  minutes smallint, rating numeric, stats jsonb, points numeric, breakdown jsonb)
on conflict (fixture_id, player_id) do update set
  club_id = excluded.club_id, position = excluded.position, minutes = excluded.minutes, rating = excluded.rating,
  stats = excluded.stats, points = excluded.points, breakdown = excluded.breakdown;
`
}

async function main() {
  const data = build(await load())
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  await writeFile(`${OUT}/000-base.sql`, baseSql(data))

  // Stat lines in batches, whole matches per file
  const byFixture = new Map()
  for (const { round, ...row } of data.lines) {
    if (!byFixture.has(row.fixture_id)) byFixture.set(row.fixture_id, [])
    byFixture.get(row.fixture_id).push(row)
  }
  let batch = []
  let size = 0
  let n = 1
  const flush = async () => {
    if (!batch.length) return
    await writeFile(`${OUT}/${String(n++).padStart(3, '0')}-stats.sql`, statsSql(batch))
    batch = []
    size = 0
  }
  for (const rows of byFixture.values()) {
    const bytes = JSON.stringify(rows).length
    if (size + bytes > MAX_FILE_BYTES) await flush()
    batch.push(...rows)
    size += bytes
  }
  await flush()

  // Rounds already played (history, or played by the season clock) pick up newly imported matches
  await writeFile(
    `${OUT}/999-refresh.sql`,
    `select replay.reveal_round(${SEASON}, number) from rounds where season_id = ${SEASON} and status = 'finished' order by number;\n`,
  )

  const priced = data.players.filter((p) => p.appearances)
  console.log(
    `Season ${SEASON}: ${data.clubs.length} clubs, ${data.players.length} players (${priced.length} priced from rounds 1–${START_ROUND - 1}), ` +
      `${data.fixtures.length} fixtures, ${data.lines.length} stat lines from ${byFixture.size} matches, ${n - 1} stat files.`,
  )
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
