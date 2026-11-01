-- The season replay: hidden future, setup, opening and revealing rounds.
-- Run by test/sql/run.sh on a fresh database, after helpers.sql.

insert into seasons (id, name, is_current) values (2024, '2024–25', true);
insert into clubs (id, name, short_code) values (1, 'Home FC', 'HOM'), (2, 'Away FC', 'AWY');
insert into rounds (season_id, number) select 2024, n from generate_series(1, 3) n;
insert into players (id, name) values (10, 'Striker'), (20, 'Keeper');

-- One match per round, two days apart in the real season; a second match in round 3, 3 hours later
insert into fixtures (id, season_id, round_id, home_club_id, away_club_id)
select n, 2024, (select id from rounds where number = n), 1, 2 from generate_series(1, 3) n;
insert into fixtures (id, season_id, round_id, home_club_id, away_club_id)
values (4, 2024, (select id from rounds where number = 3), 2, 1);
insert into replay.fixtures (fixture_id, original_kickoff, home_goals, away_goals)
select n, timestamptz '2025-01-10 17:00+00' + (n - 1) * interval '2 days', n, 0 from generate_series(1, 3) n;
insert into replay.fixtures (fixture_id, original_kickoff, home_goals, away_goals)
values (4, timestamptz '2025-01-14 20:00+00', 1, 1);
insert into replay.match_stats (fixture_id, player_id, club_id, position, minutes, stats, points)
select n, 10, 1, 'FV', 90, '{}', 6 + n from generate_series(1, 4) n;

select pg_temp.check((select count(*) from player_match_stats) = 0, 'nothing is public before setup');

select replay.setup(2024, 3);
select pg_temp.check((select count(*) from player_match_stats) = 2, 'setup reveals the stat lines of rounds 1 and 2');
select pg_temp.check((select home_goals from fixtures where id = 2) = 2, 'past results become public');
select pg_temp.check((select kickoff_at from fixtures where id = 1) = timestamptz '2025-01-10 17:00+00', 'past matches keep their real dates');
select pg_temp.check((select home_goals is null and kickoff_at is null from fixtures where id = 3), 'round 3 stays hidden');
select pg_temp.check((select status from rounds where number = 3) = 'upcoming', 'round 3 is waiting');
select pg_temp.check((select number from next_round()) = 3, 'the next round is 3');

-- Users can't read the hidden data
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select count(*) from replay.match_stats$$, null, 'a user reading the hidden stats');
select pg_temp.expect_error($$select replay.reveal_round(2024, 3)$$, null, 'a user revealing a round');
reset role;

select replay.open_round(2024, 3, timestamptz '2026-11-06 17:00+00');
select pg_temp.check((select deadline_at from rounds where number = 3) = timestamptz '2026-11-06 17:00+00', 'opening sets the transfer deadline');
select pg_temp.check((select kickoff_at from fixtures where id = 4) = timestamptz '2026-11-06 20:00+00', 'the gap between matches is kept');
select pg_temp.check((select home_goals from fixtures where id = 3) is null, 'an open round still hides its results');

select replay.reveal_round(2024, 3);
select pg_temp.check((select count(*) from player_match_stats) = 4, 'revealing makes its stat lines public');
select pg_temp.check((select status from rounds where number = 3) = 'finished', 'the round is finished');
select pg_temp.check((select kickoff_at from fixtures where id = 3) = timestamptz '2026-11-06 17:00+00', 'replayed matches keep their replay dates');
select pg_temp.check((select points from player_round_points where player_id = 10
                      and round_id = (select id from rounds where number = 3)) = 19,
  'a double round adds both matches');
select pg_temp.expect_error($$select replay.open_round(2024, 3, now())$$, null, 'reopening a played round');

select replay.setup(2024, 3);
select pg_temp.check((select count(*) from player_match_stats) = 2, 'setup can be run again to restart the replay');
