-- Season replay: play a finished season (2024–25) again, one round at a time.
--
-- The sync job loads every result and stat line into the private "replay" schema. Users can't
-- read it (it isn't exposed through the API and has no grants). The season clock then moves
-- rounds into the public tables:
--   replay.setup(season, start_round)              rounds before start_round are history; the rest are hidden
--   replay.open_round(season, round, first_kickoff) gives a round real kickoff times from first_kickoff on
--   replay.reveal_round(season, round)              plays it: results and stat lines become public
-- All three can be run again safely.

create schema if not exists replay;
revoke all on schema replay from public, anon, authenticated;

create table replay.fixtures (
  fixture_id        integer primary key references public.fixtures on delete cascade,
  original_kickoff  timestamptz,
  home_goals        smallint,
  away_goals        smallint
);

create table replay.match_stats (
  fixture_id  integer not null references public.fixtures on delete cascade,
  player_id   integer not null references public.players,
  club_id     integer not null references public.clubs,
  position    player_position not null,
  minutes     smallint not null default 0,
  rating      numeric(3,1),
  stats       jsonb not null,
  points      numeric(5,1) not null default 0,
  breakdown   jsonb not null default '[]',
  primary key (fixture_id, player_id)
);

-- Results and stat lines of one round become public; the round is finished.
create function replay.reveal_round(p_season integer, p_number integer) returns integer
language plpgsql set search_path = public as $$
declare
  v_round rounds;
  v_rows  integer;
begin
  select * into v_round from rounds where season_id = p_season and number = p_number;
  if v_round.id is null then raise exception 'Round % of season % does not exist', p_number, p_season; end if;

  update fixtures f set
    status     = 'finished',
    home_goals = r.home_goals,
    away_goals = r.away_goals,
    kickoff_at = coalesce(f.kickoff_at, r.original_kickoff),
    updated_at = now()
  from replay.fixtures r
  where r.fixture_id = f.id and f.round_id = v_round.id;

  insert into player_match_stats (fixture_id, player_id, club_id, position, minutes, rating, stats, points, breakdown)
  select s.fixture_id, s.player_id, s.club_id, s.position, s.minutes, s.rating, s.stats, s.points, s.breakdown
  from replay.match_stats s
  join fixtures f on f.id = s.fixture_id and f.round_id = v_round.id
  on conflict (fixture_id, player_id) do update set
    club_id = excluded.club_id, position = excluded.position, minutes = excluded.minutes,
    rating = excluded.rating, stats = excluded.stats, points = excluded.points,
    breakdown = excluded.breakdown, updated_at = now();
  get diagnostics v_rows = row_count;

  update rounds set status = 'finished' where id = v_round.id;
  return v_rows;
end $$;

-- Rounds before p_start become history with real dates; the rest are hidden and waiting.
create function replay.setup(p_season integer, p_start integer) returns text
language plpgsql set search_path = public as $$
declare
  r      record;
  v_rows integer := 0;
begin
  for r in select number from rounds where season_id = p_season and number < p_start order by number loop
    v_rows := v_rows + replay.reveal_round(p_season, r.number);
  end loop;

  delete from player_match_stats s using fixtures f, rounds rd
  where s.fixture_id = f.id and f.round_id = rd.id and rd.season_id = p_season and rd.number >= p_start;
  update fixtures f set status = 'scheduled', home_goals = null, away_goals = null, kickoff_at = null, updated_at = now()
  from rounds rd
  where f.round_id = rd.id and rd.season_id = p_season and rd.number >= p_start;
  update rounds set status = 'upcoming', deadline_at = null where season_id = p_season and number >= p_start;

  return format('Rounds 1–%s are history (%s stat lines); rounds %s–%s are waiting.',
                p_start - 1, v_rows, p_start,
                (select max(number) from rounds where season_id = p_season));
end $$;

-- Gives a waiting round kickoff times, keeping the real gaps between its matches.
create function replay.open_round(p_season integer, p_number integer, p_first_kickoff timestamptz) returns text
language plpgsql set search_path = public as $$
declare
  v_round rounds;
  v_first timestamptz;
begin
  select * into v_round from rounds where season_id = p_season and number = p_number;
  if v_round.id is null then raise exception 'Round % of season % does not exist', p_number, p_season; end if;
  if v_round.status = 'finished' then raise exception 'Round % has already been played', p_number; end if;

  select min(r.original_kickoff) into v_first
  from replay.fixtures r join fixtures f on f.id = r.fixture_id
  where f.round_id = v_round.id;

  update fixtures f set
    kickoff_at = p_first_kickoff + coalesce(r.original_kickoff - v_first, interval '0'),
    status     = 'scheduled',
    updated_at = now()
  from replay.fixtures r
  where r.fixture_id = f.id and f.round_id = v_round.id;
  update rounds set deadline_at = p_first_kickoff, status = 'upcoming' where id = v_round.id;

  return format('Round %s opens: transfers close at %s, last kickoff %s.',
                p_number, p_first_kickoff,
                (select max(kickoff_at) from fixtures where round_id = v_round.id));
end $$;

revoke execute on all functions in schema replay from public, anon, authenticated;
