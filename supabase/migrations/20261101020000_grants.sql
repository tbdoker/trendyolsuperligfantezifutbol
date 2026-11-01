-- Table access for the Data API roles. Row level security still decides which rows each user sees.
-- Written out explicitly so the database works whether or not the project exposes new tables by default.

grant usage on schema public to anon, authenticated, service_role;

-- Football data: anyone can read
grant select on clubs, seasons, rounds, fixtures, players, player_seasons, player_prices,
                player_match_stats, player_round_points
  to anon, authenticated;

-- Fantasy data: signed-in users read; they write only where a policy allows it
grant select, insert, update on profiles, leagues, teams to authenticated;
grant select on league_members, team_players, lineups, transfers, team_rounds, matchups,
                drafts, draft_picks, h2h_standings, total_standings
  to authenticated;
grant select, insert, update, delete on draft_queues to authenticated;

-- The import and scoring jobs use the service role
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
