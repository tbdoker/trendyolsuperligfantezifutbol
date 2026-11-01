# Tribün

Draft fantasy football for the Trendyol Süper Lig, built as a fun project with friends.

Unlike the budget-based fantasy games, every player belongs to only one team in your league. You draft
your squad live with friends, play weekly head-to-head matchups, and a scoring system rewards everything a
player does on the pitch, not only goals and assists.

## Status

Step 1: checking that the match data we need exists.

- `src/scoring.mjs`: the scoring engine (version 1 rules are at the top of the file)
- `test/`: tests for the scoring engine, run with `npm test`
- `scripts/data-check.mjs`: pulls recent Süper Lig matches from API-Football and scores every player

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
