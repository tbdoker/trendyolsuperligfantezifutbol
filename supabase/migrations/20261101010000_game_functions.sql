-- Game rules as server functions.
--
-- The app never writes squads, lineups, transfers or draft picks directly (row level security
-- blocks it). It calls these functions, which check every rule and then write.
-- Errors start with a short code, e.g. "club_limit: …", so the app can show a Turkish message.


-- HELPERS ---------------------------------------------------------------------------------

create function current_season() returns integer
language sql stable set search_path = public as $$
  select id from seasons where is_current
$$;

create function next_round() returns rounds
language sql stable set search_path = public as $$
  select * from rounds where season_id = current_season() and status = 'upcoming' order by number limit 1
$$;

-- The players a team has for a given round number (a stint counts from joined_round until left_round).
create function squad_at(p_team uuid, p_round integer) returns setof integer
language sql stable set search_path = public as $$
  select player_id from team_players
  where team_id = p_team and joined_round <= p_round and (left_round is null or left_round > p_round)
$$;

create function position_limit(p_position player_position) returns integer
language sql immutable as $$
  select case p_position when 'KL' then 2 when 'DF' then 5 when 'OS' then 5 else 3 end
$$;

-- 15 different players, 2 KL / 5 DF / 5 OS / 3 FV, at most 3 from one club.
create function check_squad_shape(p_players integer[], p_season integer) returns void
language plpgsql stable set search_path = public as $$
declare
  r record;
begin
  if coalesce(cardinality(p_players), 0) <> 15 or (select count(distinct x) from unnest(p_players) x) <> 15 then
    raise exception 'squad_size: A squad has 15 different players';
  end if;
  if (select count(*) from player_seasons where season_id = p_season and player_id = any(p_players)) <> 15 then
    raise exception 'unknown_player: Every player must be in this season''s player list';
  end if;
  for r in
    select position, count(*) as n from player_seasons
    where season_id = p_season and player_id = any(p_players)
    group by position
  loop
    if r.n <> position_limit(r.position) then
      raise exception 'squad_shape: A squad has 2 KL, 5 DF, 5 OS and 3 FV';
    end if;
  end loop;
  if exists (select 1 from player_seasons where season_id = p_season and player_id = any(p_players)
             group by club_id having count(*) > 3) then
    raise exception 'club_limit: At most 3 players from one club';
  end if;
end $$;

create function check_buyable(p_players integer[], p_season integer) returns void
language plpgsql stable set search_path = public as $$
begin
  if exists (select 1 from player_seasons where season_id = p_season and player_id = any(p_players)
             and (status = 'left' or price is null)) then
    raise exception 'not_available: One of these players cannot be bought';
  end if;
end $$;


-- CLASSIC TEAM ----------------------------------------------------------------------------

create function create_classic_team(p_name text, p_players integer[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_season integer := current_season();
  v_round  rounds := next_round();
  v_cost   numeric;
  v_team   uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in: Sign in first'; end if;
  if v_round.id is null then raise exception 'no_round: There is no upcoming round'; end if;
  if exists (select 1 from teams where owner_id = auth.uid() and season_id = v_season and mode = 'classic') then
    raise exception 'already_has_team: You already have a classic team this season';
  end if;
  perform check_squad_shape(p_players, v_season);
  perform check_buyable(p_players, v_season);
  select sum(price) into v_cost from player_seasons where season_id = v_season and player_id = any(p_players);
  if v_cost > 100 then
    raise exception 'over_budget: This squad costs % of 100.0 credits', v_cost;
  end if;

  insert into teams (season_id, owner_id, mode, name, bank)
  values (v_season, auth.uid(), 'classic', p_name, 100 - v_cost)
  returning id into v_team;
  insert into team_players (team_id, player_id, source, price_paid, joined_round)
  select v_team, player_id, 'initial', price, v_round.number
  from player_seasons where season_id = v_season and player_id = any(p_players);
  -- free_transfers null = unlimited changes until the team's first deadline
  insert into team_rounds (team_id, round_id, free_transfers) values (v_team, v_round.id, null);
  -- every classic team plays in the public leagues ("Genel")
  insert into league_members (league_id, team_id)
  select id, v_team from leagues where season_id = v_season and mode = 'classic' and is_public;
  return v_team;
end $$;


-- LEAGUES ---------------------------------------------------------------------------------

create function create_league(p_name text, p_mode league_mode, p_format league_format, p_team_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_season integer := current_season();
  v_league uuid;
  v_team   uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in: Sign in first'; end if;
  if p_mode = 'draft' and p_format <> 'h2h' then
    raise exception 'draft_is_h2h: Draft leagues are head-to-head';
  end if;
  insert into leagues (season_id, mode, format, name, owner_id)
  values (v_season, p_mode, p_format, p_name, auth.uid())
  returning id into v_league;

  if p_mode = 'classic' then
    select id into v_team from teams where owner_id = auth.uid() and season_id = v_season and mode = 'classic';
  else
    insert into teams (season_id, owner_id, mode, league_id, name)
    values (v_season, auth.uid(), 'draft', v_league, coalesce(nullif(trim(p_team_name), ''), 'Takımım'))
    returning id into v_team;
    insert into drafts (league_id) values (v_league);
  end if;
  if v_team is not null then
    insert into league_members (league_id, team_id) values (v_league, v_team);
  end if;
  return v_league;
end $$;

-- Classic: joins with your classic team. Draft: creates your team in that league.
create function join_league(p_invite_code text, p_team_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l      leagues;
  v_team uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in: Sign in first'; end if;
  select * into l from leagues where invite_code = p_invite_code;
  if l.id is null then raise exception 'bad_code: No league has this invite code'; end if;

  if l.mode = 'classic' then
    select id into v_team from teams where owner_id = auth.uid() and season_id = l.season_id and mode = 'classic';
    if v_team is null then raise exception 'no_classic_team: Build your classic team first'; end if;
  else
    select id into v_team from teams where league_id = l.id and owner_id = auth.uid();
    if v_team is null then
      if exists (select 1 from drafts where league_id = l.id and status <> 'scheduled') then
        raise exception 'draft_started: This league has already drafted';
      end if;
      if (select count(*) from league_members where league_id = l.id) >= coalesce((l.settings ->> 'max_teams')::int, 12) then
        raise exception 'league_full: This league is full';
      end if;
      insert into teams (season_id, owner_id, mode, league_id, name)
      values (l.season_id, auth.uid(), 'draft', l.id, coalesce(nullif(trim(p_team_name), ''), 'Takımım'))
      returning id into v_team;
    end if;
  end if;
  insert into league_members (league_id, team_id) values (l.id, v_team) on conflict do nothing;
  return v_team;
end $$;


-- LINEUP ----------------------------------------------------------------------------------
-- p_lineup: [{player_id, slot: "start"|"bench", bench_order, is_captain, is_vice_captain}, …]
-- Every squad player appears once. A player whose match has started is locked: his slot,
-- bench place and captaincy stay as they were.

create function save_lineup(p_team uuid, p_round integer, p_lineup jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  t        teams;
  v_round  rounds;
  v_new    lineups[];
  v_old    lineups[];
  v_squad  integer[];
  v_locked integer[];
  v_kl     integer;
  v_df     integer;
  v_os     integer;
  v_fv     integer;
begin
  select * into t from teams where id = p_team;
  if t.id is null or t.owner_id is distinct from auth.uid() then
    raise exception 'not_your_team: You can only change your own team';
  end if;
  select * into v_round from rounds where season_id = t.season_id and number = p_round;
  if v_round.id is null or v_round.status = 'finished' then
    raise exception 'round_closed: This round is over';
  end if;

  select array_agg(row(p_team, v_round.id, x.player_id, x.slot, x.bench_order,
                       coalesce(x.is_captain, false), coalesce(x.is_vice_captain, false))::lineups)
  into v_new
  from jsonb_to_recordset(p_lineup) as x(player_id integer, slot lineup_slot, bench_order smallint,
                                         is_captain boolean, is_vice_captain boolean);

  v_squad := array(select squad_at(p_team, p_round));
  if cardinality(v_squad) = 0
     or (select count(*) from unnest(v_new)) <> cardinality(v_squad)
     or (select count(distinct player_id) from unnest(v_new)) <> cardinality(v_squad)
     or exists (select 1 from unnest(v_new) n where not (n.player_id = any(v_squad))) then
    raise exception 'lineup_players: The lineup must list every squad player exactly once';
  end if;

  select count(*) filter (where ps.position = 'KL'), count(*) filter (where ps.position = 'DF'),
         count(*) filter (where ps.position = 'OS'), count(*) filter (where ps.position = 'FV')
  into v_kl, v_df, v_os, v_fv
  from unnest(v_new) n
  join player_seasons ps on ps.player_id = n.player_id and ps.season_id = t.season_id
  where n.slot = 'start';
  if v_kl + v_df + v_os + v_fv <> 11 or v_kl <> 1 or v_df not between 3 and 5
     or v_os not between 2 and 5 or v_fv not between 1 and 3 then
    raise exception 'formation: Start 11: 1 KL, 3–5 DF, 2–5 OS and 1–3 FV';
  end if;

  if exists (select 1 from unnest(v_new) n where (n.slot = 'bench') <> (n.bench_order is not null))
     or (select count(distinct bench_order) from unnest(v_new) where slot = 'bench')
        <> (select count(*) from unnest(v_new) where slot = 'bench') then
    raise exception 'bench_order: Number the bench from 1 to 4';
  end if;

  if t.mode = 'classic' then
    if (select count(*) from unnest(v_new) n where n.is_captain and n.slot = 'start') <> 1
       or (select count(*) from unnest(v_new) n where n.is_vice_captain and n.slot = 'start') <> 1
       or (select count(*) from unnest(v_new) n where n.is_captain or n.is_vice_captain) <> 2 then
      raise exception 'captain: Choose a captain and a different vice-captain among the starters';
    end if;
  elsif exists (select 1 from unnest(v_new) n where n.is_captain or n.is_vice_captain) then
    raise exception 'no_captain_in_draft: Draft leagues have no captain';
  end if;

  -- Players whose club's match in this round has kicked off
  v_locked := array(
    select n.player_id from unnest(v_new) n
    join player_seasons ps on ps.player_id = n.player_id and ps.season_id = t.season_id
    where exists (
      select 1 from fixtures f
      where f.round_id = v_round.id and ps.club_id in (f.home_club_id, f.away_club_id)
        and (f.status in ('live', 'finished') or (f.status = 'scheduled' and f.kickoff_at <= now()))
    ));

  -- Compare with what was saved for this round, or else the last lineup, which carries over
  select array_agg(l) into v_old from lineups l where l.team_id = p_team and l.round_id = v_round.id;
  if v_old is null then
    select array_agg(l) into v_old from lineups l
    where l.team_id = p_team and l.round_id = (
      select l2.round_id from lineups l2 join rounds r2 on r2.id = l2.round_id
      where l2.team_id = p_team and r2.number < p_round
      order by r2.number desc limit 1);
  end if;

  if exists (
    select 1 from unnest(v_new) n
    left join unnest(v_old) o on o.player_id = n.player_id
    where n.player_id = any(v_locked)
      and ((o.player_id is null and n.slot = 'start')
           or (o.player_id is not null
               and (n.slot, n.bench_order, n.is_captain, n.is_vice_captain)
                   is distinct from (o.slot, o.bench_order, o.is_captain, o.is_vice_captain)))
  ) then
    raise exception 'locked: A player whose match has started cannot be moved';
  end if;

  delete from lineups where team_id = p_team and round_id = v_round.id;
  insert into lineups select * from unnest(v_new);
end $$;


-- TRANSFERS (classic) ---------------------------------------------------------------------
-- Pairs: p_out[i] is replaced by p_in[i], same position. They count from the next round.
-- Free transfers come from team_rounds.free_transfers (null = unlimited before the first deadline).
-- Each extra transfer costs 4 points. A wildcard makes the whole round free, once per half-season.

create function make_transfers(p_team uuid, p_out integer[], p_in integer[], p_wildcard boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t         teams;
  v_round   rounds := next_round();
  v_tr      team_rounds;
  v_squad   integer[];
  v_new     integer[];
  v_out     numeric;
  v_in      numeric;
  v_used    integer;
  v_paid    integer := 0;
  v_is_free boolean;
  i         integer;
begin
  select * into t from teams where id = p_team;
  if t.id is null or t.owner_id is distinct from auth.uid() then
    raise exception 'not_your_team: You can only change your own team';
  end if;
  if t.mode <> 'classic' then raise exception 'classic_only: Transfers are for classic teams'; end if;
  if v_round.id is null then raise exception 'no_round: There is no upcoming round'; end if;
  if v_round.deadline_at is not null and now() >= v_round.deadline_at then
    raise exception 'deadline_passed: Transfers for this round are closed';
  end if;
  if coalesce(cardinality(p_out), 0) = 0 or cardinality(p_out) <> coalesce(cardinality(p_in), 0) then
    raise exception 'transfer_pairs: Give one player in for each player out';
  end if;

  v_squad := array(select squad_at(p_team, v_round.number));
  if exists (select 1 from unnest(p_out) x where not (x = any(v_squad))) then
    raise exception 'not_in_squad: You can only sell players in your squad';
  end if;
  if exists (select 1 from unnest(p_in) x where x = any(v_squad)) then
    raise exception 'already_in_squad: That player is already in your squad';
  end if;
  for i in 1 .. cardinality(p_out) loop
    if (select position from player_seasons where season_id = t.season_id and player_id = p_out[i])
       is distinct from (select position from player_seasons where season_id = t.season_id and player_id = p_in[i]) then
      raise exception 'same_position: Each player in must play the same position as the player out';
    end if;
  end loop;
  perform check_buyable(p_in, t.season_id);
  v_new := array(select x from unnest(v_squad) x where not (x = any(p_out)) union all select unnest(p_in));
  perform check_squad_shape(v_new, t.season_id);

  select coalesce(sum(price), 0) into v_out from player_seasons where season_id = t.season_id and player_id = any(p_out);
  select coalesce(sum(price), 0) into v_in from player_seasons where season_id = t.season_id and player_id = any(p_in);
  if t.bank + v_out - v_in < 0 then
    raise exception 'over_budget: These transfers need % more credits', v_in - v_out - t.bank;
  end if;

  insert into team_rounds (team_id, round_id, free_transfers) values (p_team, v_round.id, 1)
  on conflict (team_id, round_id) do nothing;
  select * into v_tr from team_rounds where team_id = p_team and round_id = v_round.id for update;

  if p_wildcard and v_tr.chip is distinct from 'wildcard' then
    if v_tr.chip is not null then raise exception 'one_chip: Only one power-up per round'; end if;
    if exists (select 1 from team_rounds tr join rounds r on r.id = tr.round_id
               where tr.team_id = p_team and tr.chip = 'wildcard'
                 and (r.number <= 17) = (v_round.number <= 17)) then
      raise exception 'wildcard_used: You have already used the wildcard in this half of the season';
    end if;
    update team_rounds set chip = 'wildcard', transfer_cost = 0 where team_id = p_team and round_id = v_round.id;
    update transfers set is_free = true where team_id = p_team and round_id = v_round.id;
    v_tr.chip := 'wildcard';
  end if;

  select count(*) into v_used from transfers where team_id = p_team and round_id = v_round.id and is_free;
  for i in 1 .. cardinality(p_out) loop
    v_is_free := v_tr.free_transfers is null
                 or v_tr.chip is not distinct from 'wildcard'
                 or v_used < v_tr.free_transfers;
    if v_is_free then v_used := v_used + 1; else v_paid := v_paid + 1; end if;
    insert into transfers (team_id, round_id, player_out, player_in, price_out, price_in, is_free)
    values (p_team, v_round.id, p_out[i], p_in[i],
            (select price from player_seasons where season_id = t.season_id and player_id = p_out[i]),
            (select price from player_seasons where season_id = t.season_id and player_id = p_in[i]),
            v_is_free);
    -- the new player takes the old one's place in a lineup already saved for this round
    update lineups set player_id = p_in[i]
    where team_id = p_team and round_id = v_round.id and player_id = p_out[i];
  end loop;

  update team_players set left_round = v_round.number, left_at = now()
  where team_id = p_team and player_id = any(p_out) and left_at is null;
  insert into team_players (team_id, player_id, source, price_paid, joined_round)
  select p_team, player_id, 'transfer', price, v_round.number
  from player_seasons where season_id = t.season_id and player_id = any(p_in);
  update teams set bank = bank + v_out - v_in where id = p_team;
  update team_rounds set transfer_cost = transfer_cost + 4 * v_paid where team_id = p_team and round_id = v_round.id;

  return jsonb_build_object('paid_transfers', v_paid, 'points_cost', 4 * v_paid, 'bank', t.bank + v_out - v_in);
end $$;


-- DRAFT -----------------------------------------------------------------------------------
-- The pick order reverses every round: 1-2-3, 3-2-1, 1-2-3 …

create function draft_team_at(p_order uuid[], p_pick integer) returns uuid
language sql immutable as $$
  select case when ((p_pick - 1) / cardinality(p_order)) % 2 = 0
              then p_order[(p_pick - 1) % cardinality(p_order) + 1]
              else p_order[cardinality(p_order) - (p_pick - 1) % cardinality(p_order)]
         end
$$;

create function start_draft(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l leagues;
  d drafts;
begin
  select * into l from leagues where id = p_league;
  if l.id is null or l.owner_id is distinct from auth.uid() then
    raise exception 'not_owner: Only the league owner can start the draft';
  end if;
  select * into d from drafts where league_id = p_league for update;
  if d.status <> 'scheduled' then raise exception 'draft_started: This draft has already started'; end if;
  if (select count(*) from league_members where league_id = p_league) < 2 then
    raise exception 'too_few_teams: A draft needs at least 2 teams';
  end if;
  update drafts set
    status        = 'live',
    pick_order    = case when cardinality(pick_order) > 0 then pick_order
                         else array(select team_id from league_members where league_id = p_league order by random()) end,
    current_pick  = 1,
    starts_at     = coalesce(starts_at, now()),
    pick_deadline = now() + make_interval(secs => pick_seconds)
  where id = d.id;
end $$;

-- Shared by manual and automatic picks. Not callable by users directly.
create function do_draft_pick(p_draft drafts, p_team uuid, p_player integer, p_auto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  l       leagues;
  v_pos   player_position;
  v_have  integer;
  v_round rounds := next_round();
begin
  select * into l from leagues where id = p_draft.league_id;
  select position into v_pos from player_seasons
  where season_id = l.season_id and player_id = p_player and status <> 'left';
  if v_pos is null then raise exception 'not_available: That player cannot be drafted'; end if;
  if exists (select 1 from team_players where league_id = l.id and player_id = p_player and left_at is null) then
    raise exception 'already_taken: That player is already on a team in this league';
  end if;
  select count(*) into v_have
  from team_players tp join player_seasons ps on ps.player_id = tp.player_id and ps.season_id = l.season_id
  where tp.team_id = p_team and tp.left_at is null and ps.position = v_pos;
  if v_have >= position_limit(v_pos) then
    raise exception 'position_full: Your squad already has enough % players', v_pos;
  end if;

  insert into draft_picks (draft_id, pick_no, team_id, player_id, is_auto)
  values (p_draft.id, p_draft.current_pick, p_team, p_player, p_auto);
  insert into team_players (team_id, player_id, source, joined_round)
  values (p_team, p_player, 'draft', coalesce(v_round.number, 1));

  if p_draft.current_pick >= p_draft.rounds * cardinality(p_draft.pick_order) then
    update drafts set status = 'done', current_pick = current_pick + 1, pick_deadline = null where id = p_draft.id;
  else
    update drafts set current_pick = current_pick + 1, pick_deadline = now() + make_interval(secs => pick_seconds)
    where id = p_draft.id;
  end if;
end $$;

create function draft_pick(p_league uuid, p_player integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  d      drafts;
  v_team uuid;
begin
  select * into d from drafts where league_id = p_league for update;  -- one pick at a time
  if d.id is null or d.status <> 'live' then raise exception 'draft_not_live: The draft is not running'; end if;
  v_team := draft_team_at(d.pick_order, d.current_pick);
  if not exists (select 1 from teams where id = v_team and owner_id = auth.uid()) then
    raise exception 'not_your_turn: It is not your pick';
  end if;
  perform do_draft_pick(d, v_team, p_player, false);
end $$;

-- When the clock runs out, anyone in the league (or the server) can trigger the pick:
-- the first available player on the manager's wish list, otherwise the best available by price.
create function draft_autopick(p_league uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d        drafts;
  l        leagues;
  v_team   uuid;
  v_player integer;
begin
  if auth.uid() is not null and not is_member(p_league) then
    raise exception 'not_member: You are not in this league';
  end if;
  select * into d from drafts where league_id = p_league for update;
  if d.id is null or d.status <> 'live' then raise exception 'draft_not_live: The draft is not running'; end if;
  if now() < d.pick_deadline then raise exception 'not_yet: The pick clock is still running'; end if;
  select * into l from leagues where id = p_league;
  v_team := draft_team_at(d.pick_order, d.current_pick);

  select ps.player_id into v_player
  from player_seasons ps
  left join draft_queues q on q.team_id = v_team and q.player_id = ps.player_id
  where ps.season_id = l.season_id and ps.status <> 'left'
    and not exists (select 1 from team_players tp
                    where tp.league_id = l.id and tp.player_id = ps.player_id and tp.left_at is null)
    and (select count(*) from team_players tp
         join player_seasons p2 on p2.player_id = tp.player_id and p2.season_id = l.season_id
         where tp.team_id = v_team and tp.left_at is null and p2.position = ps.position)
        < position_limit(ps.position)
  order by q.rank nulls last, ps.price desc nulls last, ps.player_id
  limit 1;
  if v_player is null then raise exception 'no_players: No player is left to pick'; end if;

  perform do_draft_pick(d, v_team, v_player, true);
  return v_player;
end $$;


-- WHO CAN CALL WHAT -----------------------------------------------------------------------
-- Supabase lets every role run new functions by default; game functions are for signed-in
-- users only, and the internal ones for nobody but other functions.

revoke execute on function
  create_classic_team(text, integer[]),
  create_league(text, league_mode, league_format, text),
  join_league(text, text),
  save_lineup(uuid, integer, jsonb),
  make_transfers(uuid, integer[], integer[], boolean),
  start_draft(uuid),
  draft_pick(uuid, integer),
  draft_autopick(uuid)
from public, anon;

grant execute on function
  create_classic_team(text, integer[]),
  create_league(text, league_mode, league_format, text),
  join_league(text, text),
  save_lineup(uuid, integer, jsonb),
  make_transfers(uuid, integer[], integer[], boolean),
  start_draft(uuid),
  draft_pick(uuid, integer),
  draft_autopick(uuid)
to authenticated, service_role;

revoke execute on function
  do_draft_pick(drafts, uuid, integer, boolean),
  check_squad_shape(integer[], integer),
  check_buyable(integer[], integer)
from public, anon, authenticated;
