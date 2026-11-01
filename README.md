# Tribün

Draft fantasy football for the Trendyol Süper Lig, built as a fun project with friends.

Unlike the budget-based fantasy games, every player belongs to only one team in your league. You draft
your squad live with friends, play weekly head-to-head matchups, and a scoring system rewards everything a
player does on the pitch, not only goals and assists.

## Status

Two modes share one codebase: **classic** (one budget team, many leagues) and **draft** (one team per
league, each player owned by only one manager).

- `src/scoring.mjs`: the scoring engine (version 1 rules are at the top of the file)
- `supabase/migrations/`: the database. Football data, fantasy data, results and the draft, with row level security
- `test/`: scoring tests (`npm test`) and database rule checks (`test/sql/run.sh`, needs Postgres 15+)
- `scripts/data-check.mjs`: checks which stats API-Football has for recent Süper Lig matches
- `scripts/import-season.mjs` and `scripts/analyze-season.mjs`: import a season a little each day and analyse
  how points behave. The report is in `reports/`. Match data is never committed, because the repository is public.

## Running the data check

The API key lives in the repository secret `APIFOOTBALL_KEY` and is never committed.
Run it from **Actions → Data check → Run workflow**. The report appears on the run's summary page.

Locally, with Node 20 or newer:

```sh
APIFOOTBALL_KEY=your-key node scripts/data-check.mjs
```

## Plan

- **v1:** sign-in, invite-link leagues, live draft room, weekly lineups, head-to-head matchups, scoring with a per-player breakdown
- **v2:** blind bidding for unpicked players, trades, league chat, live points, push notifications
- **Stack:** Next.js, Supabase, Vercel, API-Football

No money or prizes, and no club logos or player photos.
