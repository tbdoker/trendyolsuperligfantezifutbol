-- Tries to break the table rules of the first migration (constraints, triggers, row level security).
-- Run by test/sql/run.sh on a fresh database, after helpers.sql. Any failed check stops the run.

-- Football data
insert into seasons (id, name, is_current) values (2026, '2026–27', true);
insert into clubs (id, name, short_code) values (611, 'Fenerbahçe', 'FB'), (645, 'Galatasaray', 'GS');
insert into rounds (season_id, number, status) values (2026, 1, 'finished'), (2026, 2, 'upcoming');
insert into players (id, name, short_name) values (1, 'Vedat Muriqi', 'Muriqi'), (2, 'Victor Osimhen', 'Osimhen'), (3, 'Mert Günok', 'Günok');
insert into player_seasons (player_id, season_id, club_id, position, price)
values (1, 2026, 611, 'FV', 9.5), (2, 2026, 645, 'FV', 11.0), (3, 2026, 611, 'KL', 5.0);

-- Users: ali and berk play together, cem plays in a different draft league, deniz is in nothing
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
                              ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'ali', 'Ali'), ('00000000-0000-0000-0000-00000000000b', 'berk', 'Berk'),
  ('00000000-0000-0000-0000-00000000000c', 'cem', 'Cem'), ('00000000-0000-0000-0000-00000000000d', 'deniz', 'Deniz');

insert into leagues (id, season_id, mode, format, name, owner_id) values
  ('10000000-0000-0000-0000-000000000001', 2026, 'classic', 'total', 'Kampüs Klasik', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', 2026, 'draft',   'h2h',   'Kampüs Draft',  '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000003', 2026, 'draft',   'h2h',   'Yurt Draft',    '00000000-0000-0000-0000-00000000000c');

insert into teams (id, season_id, owner_id, mode, league_id, name) values
  ('20000000-0000-0000-0000-00000000000a', 2026, '00000000-0000-0000-0000-00000000000a', 'classic', null, 'Ali Klasik'),
  ('20000000-0000-0000-0000-00000000000b', 2026, '00000000-0000-0000-0000-00000000000b', 'classic', null, 'Berk Klasik'),
  ('30000000-0000-0000-0000-00000000000a', 2026, '00000000-0000-0000-0000-00000000000a', 'draft', '10000000-0000-0000-0000-000000000002', 'Ali Draft'),
  ('30000000-0000-0000-0000-00000000000b', 2026, '00000000-0000-0000-0000-00000000000b', 'draft', '10000000-0000-0000-0000-000000000002', 'Berk Draft'),
  ('30000000-0000-0000-0000-00000000000c', 2026, '00000000-0000-0000-0000-00000000000c', 'draft', '10000000-0000-0000-0000-000000000003', 'Cem Draft');

insert into league_members (league_id, team_id) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000c');

-- Rules about teams and leagues
select pg_temp.expect_error($$insert into teams (season_id, owner_id, mode, name)
  values (2026, '00000000-0000-0000-0000-00000000000a', 'classic', 'Second classic team')$$, null, 'a second classic team in the same season');
select pg_temp.expect_error($$insert into teams (season_id, owner_id, mode, name)
  values (2026, '00000000-0000-0000-0000-00000000000d', 'draft', 'No league')$$, null, 'a draft team without a league');
select pg_temp.expect_error($$insert into league_members values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a')$$,
  null, 'a classic team joining a draft league');
select pg_temp.expect_error($$insert into league_members values ('10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-00000000000a')$$,
  null, 'a draft team joining another draft league');

-- One owner per player in a draft league; any number in classic
insert into team_players (team_id, player_id, source, joined_round) values ('30000000-0000-0000-0000-00000000000a', 1, 'draft', 1);
select pg_temp.expect_error($$insert into team_players (team_id, player_id, source, joined_round)
  values ('30000000-0000-0000-0000-00000000000b', 1, 'draft', 1)$$, null, 'Muriqi owned twice in the same draft league');
insert into team_players (team_id, player_id, source, joined_round) values ('30000000-0000-0000-0000-00000000000c', 1, 'draft', 1);
select pg_temp.check(true, 'Muriqi can be owned in a different draft league');
insert into team_players (team_id, player_id, source, price_paid, joined_round)
values ('20000000-0000-0000-0000-00000000000a', 1, 'initial', 9.5, 1), ('20000000-0000-0000-0000-00000000000b', 1, 'initial', 9.5, 1);
select pg_temp.check(true, 'two classic teams can both own Muriqi');
update team_players set left_at = now(), left_round = 2 where team_id = '30000000-0000-0000-0000-00000000000a' and player_id = 1;
insert into team_players (team_id, player_id, source, joined_round) values ('30000000-0000-0000-0000-00000000000b', 1, 'free_agent', 2);
select pg_temp.check(true, 'once released, another team in the league can sign him');

-- Lineup rules
insert into lineups (team_id, round_id, player_id, slot, is_captain) values ('20000000-0000-0000-0000-00000000000a', 2, 1, 'start', true);
select pg_temp.expect_error($$insert into lineups (team_id, round_id, player_id, slot, is_captain)
  values ('20000000-0000-0000-0000-00000000000a', 2, 2, 'start', true)$$, null, 'two captains');
select pg_temp.expect_error($$insert into lineups (team_id, round_id, player_id, slot)
  values ('20000000-0000-0000-0000-00000000000a', 2, 3, 'bench')$$, null, 'a bench player without a bench order');

-- Standings
insert into matchups (league_id, round_id, home_team_id, away_team_id, home_points, away_points)
values ('10000000-0000-0000-0000-000000000002', 1, '30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', 61.5, 57.0);
select pg_temp.check((select league_points from h2h_standings where team_id = '30000000-0000-0000-0000-00000000000a') = 3, 'a head-to-head win is worth 3 points');
insert into team_rounds (team_id, round_id, points, transfer_cost) values ('20000000-0000-0000-0000-00000000000a', 1, 70.0, 4);
select pg_temp.check((select points from total_standings where team_id = '20000000-0000-0000-0000-00000000000a') = 66.0, 'total standings subtract transfer costs');

-- Row level security, acting as each user
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Berk
select pg_temp.check((select count(*) from teams where league_id = '10000000-0000-0000-0000-000000000002') = 2, 'Berk sees both teams in his draft league');
select pg_temp.check((select count(*) from teams where id = '30000000-0000-0000-0000-00000000000c') = 0, 'Berk cannot see Cem''s team in another league');
select pg_temp.check((select count(*) from leagues) = 2, 'Berk sees only his two leagues');
select pg_temp.check((select count(*) from clubs) = 2, 'everyone can read football data');
select pg_temp.expect_error($$insert into team_players (team_id, player_id, source, joined_round)
  values ('30000000-0000-0000-0000-00000000000b', 2, 'draft', 2)$$, null, 'Berk adding a player directly (must go through a server function)');
select pg_temp.expect_error($$insert into clubs (id, name, short_code) values (1, 'Fake', 'FK')$$, null, 'Berk writing football data');
update teams set name = 'Renamed by Berk' where id = '30000000-0000-0000-0000-00000000000a';
reset role;
select pg_temp.check((select name from teams where id = '30000000-0000-0000-0000-00000000000a') = 'Ali Draft', 'Berk cannot rename Ali''s team');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Deniz, in no league
select pg_temp.check((select count(*) from leagues) = 0, 'Deniz sees no private leagues');
select pg_temp.check((select count(*) from lineups) = 0, 'Deniz sees no lineups');
reset role;
