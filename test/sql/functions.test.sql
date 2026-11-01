-- Tries to break the game rules in the server functions.
-- Run by test/sql/run.sh on a fresh database, after helpers.sql. Any failed check stops the run.

-- Football data: 6 clubs with 8 players each (1 KL, 2 DF, 3 OS, 2 FV), player id = club × 100 + n
insert into seasons (id, name, is_current) values (2026, '2026–27', true);
insert into clubs (id, name, short_code) select c, 'Club ' || c, 'C' || c from generate_series(1, 6) c;
insert into rounds (season_id, number, status, deadline_at) values
  (2026, 10, 'finished', now() - interval '6 days'),
  (2026, 11, 'upcoming', now() + interval '2 days'),
  (2026, 12, 'upcoming', now() + interval '9 days');
insert into players (id, name) select c * 100 + n, 'Player ' || (c * 100 + n) from generate_series(1, 6) c, generate_series(1, 8) n;
insert into player_seasons (player_id, season_id, club_id, position, price)
select c * 100 + n, 2026, c,
       (case when n = 1 then 'KL' when n <= 3 then 'DF' when n <= 6 then 'OS' else 'FV' end)::player_position,
       4.5 + ((c + n) % 5) * 0.5
from generate_series(1, 6) c, generate_series(1, 8) n;
insert into players (id, name) values (999, 'Expensive Star');
insert into player_seasons (player_id, season_id, club_id, position, price) values (999, 2026, 6, 'FV', 40.0);
-- Round 11: club 1 v 5, club 2 v 3, club 4 v 6
insert into fixtures (id, season_id, round_id, home_club_id, away_club_id, kickoff_at)
select f.id, 2026, (select id from rounds where number = 11), f.h, f.a, now() + interval '1 day'
from (values (1, 1, 5), (2, 2, 3), (3, 4, 6)) as f(id, h, a);

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
                              ('00000000-0000-0000-0000-00000000000c');
insert into profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'ali', 'Ali'), ('00000000-0000-0000-0000-00000000000b', 'berk', 'Berk'),
  ('00000000-0000-0000-0000-00000000000c', 'cem', 'Cem');

-- A valid 15: 3 each from clubs 1–4, 2 from club 5, 1 from club 6, costing 85.0
\set squad 'array[101,201, 102,103,202,302,303, 204,304,404,405,406, 507,508,607]'

-- Lineup as JSON: starters, bench in order, captain, vice-captain
create function pg_temp.lineup(starters integer[], bench integer[], captain integer, vice integer) returns jsonb
language sql as $$
  select jsonb_agg(x) from (
    select jsonb_build_object('player_id', p, 'slot', 'start', 'is_captain', p = captain, 'is_vice_captain', p = vice) as x
    from unnest(starters) p
    union all
    select jsonb_build_object('player_id', p, 'slot', 'bench', 'bench_order', o)
    from unnest(bench) with ordinality b(p, o)
  ) s
$$;


-- CLASSIC TEAM ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); -- Ali
select create_classic_team('Ali FC', :squad) as ali_team \gset
select pg_temp.check((select bank from teams where id = :'ali_team') = 15.0, 'Ali''s squad costs 85.0, leaving 15.0 in the bank');
select pg_temp.expect_error($$select create_classic_team('Ali FC 2', array[101,201,102,103,202,302,303,204,304,404,405,406,507,508,607])$$,
  'already_has_team', 'a second classic team');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Berk
select pg_temp.expect_error($$select create_classic_team('X', array[101,201,102,103,202,302,303,204,304,404,405,406,507,508,107])$$,
  'club_limit', 'four players from club 1');
select pg_temp.expect_error($$select create_classic_team('X', array[101,201,102,103,202,302,303,204,304,404,405,406,507,508,605])$$,
  'squad_shape', 'six midfielders and two forwards');
select pg_temp.expect_error($$select create_classic_team('X', array[101,201,102,103,202,302,303,204,304,404,405,406,507,508,999])$$,
  'over_budget', 'a squad over 100 credits');
select pg_temp.expect_error($$select create_classic_team('X', array[101,201,102,103,202,302,303,204,304,404,405,406,507,508])$$,
  'squad_size', 'only 14 players');
select create_classic_team('Berk FC', :squad) as berk_team \gset
select pg_temp.check(true, 'two managers can pick the same players in classic');


-- LEAGUES --------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select create_league('Kampüs', 'classic', 'total') as classic_league \gset
select invite_code as classic_code from leagues where id = :'classic_league' \gset

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select join_league(:'classic_code') as joined \gset
select pg_temp.check(:'joined' = :'berk_team', 'Berk joins with his classic team');
select pg_temp.check((select count(*) from league_members where league_id = :'classic_league') = 2, 'the classic league has 2 teams');
select pg_temp.expect_error($$select join_league('nope1234')$$, 'bad_code', 'a wrong invite code');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- Cem has no classic team
select pg_temp.expect_error(format('select join_league(%L)', :'classic_code'), 'no_classic_team', 'joining a classic league without a team');


-- LINEUP ---------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
-- 1-4-3-3: KL 101 · DF 102 103 202 302 · OS 204 304 404 · FV 507 508 607 · bench 201 303 405 406
select save_lineup(:'ali_team', 11, pg_temp.lineup(array[101,102,103,202,302,204,304,404,507,508,607], array[201,303,405,406], 507, 204));
select pg_temp.check((select count(*) from lineups where team_id = :'ali_team') = 15, 'a valid 1-4-3-3 lineup is saved');

select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, 507, 204))', :'ali_team',
  '{101,201,102,103,202,302,204,304,404,507,508}', '{607,303,405,406}'), 'formation', 'two goalkeepers starting');
select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, null, 204))', :'ali_team',
  '{101,102,103,202,302,204,304,404,507,508,607}', '{201,303,405,406}'), 'captain', 'no captain');
select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, 507, 204))', :'ali_team',
  '{101,102,103,202,302,204,304,404,507,508,607}', '{201,303,405,106}'), 'lineup_players', 'a player who is not in the squad');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, 507, 204))', :'ali_team',
  '{101,102,103,202,302,204,304,404,507,508,607}', '{201,303,405,406}'), 'not_your_team', 'Berk editing Ali''s lineup');

-- Club 4 v club 6 kicks off: 404, 405, 406 and 607 are locked
reset role;
update fixtures set status = 'live', kickoff_at = now() - interval '10 minutes' where id = 3;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, 607, 204))', :'ali_team',
  '{101,102,103,202,302,204,304,404,507,508,607}', '{201,303,405,406}'), 'locked', 'making a player whose match started captain');
select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, 507, 204))', :'ali_team',
  '{101,102,103,202,302,204,405,404,507,508,607}', '{201,303,304,406}'), 'locked', 'bringing on a bench player whose match started');
select save_lineup(:'ali_team', 11, pg_temp.lineup(array[101,102,103,202,303,204,304,404,507,508,607], array[201,302,405,406], 508, 204));
select pg_temp.check((select player_id from lineups where team_id = :'ali_team' and is_captain) = 508,
  'players whose match has not started can still be swapped, and the captain moved');

-- Club 1 v club 5 kicks off too: the captain (508) is now locked
reset role;
update fixtures set status = 'live', kickoff_at = now() - interval '5 minutes' where id = 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error(format('select save_lineup(%L, 11, pg_temp.lineup(%L, %L, 304, 204))', :'ali_team',
  '{101,102,103,202,303,204,304,404,507,508,607}', '{201,302,405,406}'), 'locked', 'moving the captaincy away from a player who is playing');


-- TRANSFERS ------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select make_transfers(:'berk_team', array[607], array[608]) ->> 'paid_transfers' as paid \gset
select pg_temp.check(:'paid' = '0', 'before the first deadline every transfer is free');

reset role;  -- after the first deadline Berk gets 1 free transfer, already used above
update team_rounds set free_transfers = 1 where team_id = :'berk_team';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select make_transfers(:'berk_team', array[405], array[605]) ->> 'points_cost' as cost \gset
select pg_temp.check(:'cost' = '4', 'an extra transfer costs 4 points');
select pg_temp.check((select transfer_cost from team_rounds where team_id = :'berk_team' and round_id = (select id from rounds where number = 11)) = 4,
  'the cost is recorded for the round');
select pg_temp.check((select bank from teams where id = :'berk_team') = 16.0, 'the bank follows the prices (15.0 + 6.0 − 6.5 + 6.5 − 5.0)');

select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'berk_team', '{304}', '{104}'), 'club_limit', 'a fourth player from club 1');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'berk_team', '{102}', '{105}'), 'same_position', 'a defender out, a midfielder in');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'berk_team', '{508}', '{999}'), 'over_budget', 'not enough credits');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'berk_team', '{302}', '{303}'), 'already_in_squad', 'buying a player he already has');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'berk_team', '{106}', '{107}'), 'not_in_squad', 'selling a player he does not have');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'ali_team', '{607}', '{608}'), 'not_your_team', 'transfers for someone else''s team');

select make_transfers(:'berk_team', array[406], array[606], true);
select pg_temp.check((select transfer_cost from team_rounds where team_id = :'berk_team' and round_id = (select id from rounds where number = 11)) = 0,
  'the wildcard makes the whole round free');
select pg_temp.check((select count(*) from transfers where team_id = :'berk_team' and not is_free) = 0, 'every transfer this round is now free');
select pg_temp.check((select count(*) from squad_at(:'berk_team', 11)) = 15, 'the squad still has 15 players');

reset role;
update rounds set status = 'finished' where number = 11;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L, true)', :'berk_team', '{606}', '{406}'), 'wildcard_used', 'a second wildcard in the same half');
reset role;
update rounds set deadline_at = now() - interval '1 minute' where number = 12;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select make_transfers(%L, %L, %L)', :'berk_team', '{606}', '{406}'), 'deadline_passed', 'transfers after the deadline');
reset role;
update rounds set deadline_at = now() + interval '9 days' where number = 12;


-- DRAFT ----------------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select create_league('Kampüs Draft', 'draft', 'h2h', 'Ali Draft') as draft_league \gset
select invite_code as draft_code from leagues where id = :'draft_league' \gset
select id as ali_draft from teams where league_id = :'draft_league' and owner_id = '00000000-0000-0000-0000-00000000000a' \gset

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select join_league(:'draft_code', 'Berk Draft') as berk_draft \gset
select pg_temp.expect_error(format('select start_draft(%L)', :'draft_league'), 'not_owner', 'Berk starting Ali''s draft');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select join_league(:'draft_code', 'Cem Draft') as cem_draft \gset

reset role;  -- fix the order so the test is predictable: Ali, Berk, Cem
update drafts set pick_order = array[:'ali_draft', :'berk_draft', :'cem_draft']::uuid[] where league_id = :'draft_league';
select pg_temp.check(draft_team_at(array[:'ali_draft', :'berk_draft', :'cem_draft']::uuid[], 4) = :'cem_draft',
  'the order reverses: pick 4 is Cem again');
select pg_temp.check(draft_team_at(array[:'ali_draft', :'berk_draft', :'cem_draft']::uuid[], 6) = :'ali_draft',
  'and pick 6 is Ali');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select start_draft(:'draft_league');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select draft_pick(%L, 999)', :'draft_league'), 'not_your_turn', 'Berk picking on Ali''s turn');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select draft_pick(:'draft_league', 999);                                            -- 1 Ali
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select draft_pick(%L, 999)', :'draft_league'), 'already_taken', 'a player who is already taken');
select draft_pick(:'draft_league', 101);                                            -- 2 Berk KL
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select draft_pick(:'draft_league', 201);                                            -- 3 Cem
select draft_pick(:'draft_league', 301);                                            -- 4 Cem again
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select draft_pick(:'draft_league', 401);                                            -- 5 Berk KL
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select draft_pick(:'draft_league', 102);                                            -- 6 Ali
select draft_pick(:'draft_league', 103);                                            -- 7 Ali again
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select draft_pick(%L, 501)', :'draft_league'), 'position_full', 'a third goalkeeper');
select draft_pick(:'draft_league', 104);                                            -- 8 Berk

-- Pick 9 is Cem's. His wish list starts with a taken player, then 105.
reset role;
insert into draft_queues (team_id, player_id, rank) values (:'cem_draft', 999, 1), (:'cem_draft', 105, 2);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('select draft_autopick(%L)', :'draft_league'), 'not_yet', 'auto-pick while the clock is running');
reset role;
update drafts set pick_deadline = now() - interval '1 second' where league_id = :'draft_league';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select draft_autopick(:'draft_league') as auto_player \gset
select pg_temp.check(:'auto_player' = '105', 'auto-pick takes the first available player on the wish list');
select pg_temp.check((select is_auto from draft_picks where player_id = 105), 'the pick is marked as automatic');
select pg_temp.check((select current_pick from drafts where league_id = :'draft_league') = 10, 'the draft moves on to pick 10');
select pg_temp.expect_error(format($$insert into draft_picks (draft_id, pick_no, team_id, player_id)
  select id, 10, %L, 106 from drafts where league_id = %L$$, :'berk_draft', :'draft_league'), null, 'writing a pick directly');
select pg_temp.check((select count(*) from team_players where league_id = :'draft_league') = 9, 'every pick is in a squad');
reset role;
