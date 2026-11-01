-- Tribün database, version 1 (Supabase / Postgres)
--
-- Four groups of tables:
--   1. Football data  – imported from API-Football by the scheduled job; read-only for users
--   2. Fantasy        – what users create: profiles, leagues, teams, squads, lineups, transfers
--   3. Results        – weekly points per team, head-to-head matchups, standings
--   4. Draft          – draft night: the draft, its picks, and each manager's wish list
--
-- One design choice runs through everything: classic and draft share the same tables.
--   classic: one team per user per season, playing in many leagues (league_members)
--   draft:   one team per user per league; each player can be owned by only one team in that league

create extension if not exists pgcrypto;

create type player_position as enum ('KL', 'DF', 'OS', 'FV');
create type league_mode as enum ('classic', 'draft');
create type league_format as enum ('total', 'h2h');           -- points table or head-to-head
create type round_status as enum ('upcoming', 'live', 'finished');
create type fixture_status as enum ('scheduled', 'live', 'finished', 'postponed', 'cancelled');
create type lineup_slot as enum ('start', 'bench');
create type acquisition as enum ('initial', 'transfer', 'draft', 'free_agent', 'trade');
create type draft_status as enum ('scheduled', 'live', 'done');


-- 1. FOOTBALL DATA ------------------------------------------------------------------------

create table clubs (
  id              integer primary key,          -- API-Football team id
  name            text not null,
  short_code      text not null,                -- GS, FB, BJK …
  color_primary   text,                         -- hex; used for club chips and user accents
  color_secondary text
);
comment on table clubs is 'Süper Lig clubs. Colors only: no logos.';

create table seasons (
  id             integer primary key,           -- start year: 2026 = 2026–27
  api_league_id  integer not null default 203,  -- Süper Lig on API-Football
  name           text not null,
  is_current     boolean not null default false
);
create unique index seasons_one_current on seasons (is_current) where is_current;

create table rounds (
  id           bigint generated always as identity primary key,
  season_id    integer not null references seasons,
  number       integer not null,                -- hafta 1–34
  deadline_at  timestamptz,                     -- first kickoff of the round: transfers lock here
  status       round_status not null default 'upcoming',
  unique (season_id, number)
);
comment on column rounds.deadline_at is 'Transfers lock at the first kickoff. Lineup swaps lock per player, at his own kickoff.';

create table fixtures (
  id            integer primary key,            -- API-Football fixture id
  season_id     integer not null references seasons,
  round_id      bigint not null references rounds, -- can change when a match is postponed
  home_club_id  integer not null references clubs,
  away_club_id  integer not null references clubs,
  kickoff_at    timestamptz,                    -- null while TFF has not set the time
  status        fixture_status not null default 'scheduled',
  home_goals    smallint,
  away_goals    smallint,
  updated_at    timestamptz not null default now()
);
create index fixtures_round on fixtures (round_id);
create index fixtures_kickoff on fixtures (kickoff_at);

create table players (
  id          integer primary key,              -- API-Football player id
  name        text not null,
  short_name  text                              -- for tight spaces: "Muriqi"
);

create table player_seasons (
  player_id  integer not null references players,
  season_id  integer not null references seasons,
  club_id    integer references clubs,          -- current club; changes in transfer windows
  position   player_position not null,
  price      numeric(4,1),                      -- classic mode: current price in credits
  status     text not null default 'available'  -- available, injured, suspended, left
             check (status in ('available', 'injured', 'suspended', 'left')),
  primary key (player_id, season_id)
);
create index player_seasons_club on player_seasons (season_id, club_id);

create table player_prices (
  player_id  integer not null,
  season_id  integer not null,
  round_id   bigint not null references rounds,
  price      numeric(4,1) not null,
  primary key (player_id, round_id),
  foreign key (player_id, season_id) references player_seasons
);
comment on table player_prices is 'Price history: one row per player per round, for charts and the pricing rule.';

create table player_match_stats (
  fixture_id  integer not null references fixtures on delete cascade,
  player_id   integer not null references players,
  club_id     integer not null references clubs,
  position    player_position not null,
  minutes     smallint not null default 0,
  rating      numeric(3,1),                     -- API rating; decides the match bonus
  stats       jsonb not null,                   -- normalized stat line, see src/scoring.mjs
  points      numeric(5,1) not null default 0,
  breakdown   jsonb not null default '[]',      -- rows shown in the app: label, count, points
  updated_at  timestamptz not null default now(),
  primary key (fixture_id, player_id)
);
create index player_match_stats_player on player_match_stats (player_id);
comment on table player_match_stats is 'Points are stored per match, so a postponed match moved into another round still adds up correctly.';

create view player_round_points with (security_invoker = true) as
select s.player_id, f.round_id,
       sum(s.points)  as points,
       sum(s.minutes) as minutes,
       count(*)       as matches                  -- 2 in a double round
from player_match_stats s
join fixtures f on f.id = s.fixture_id
group by s.player_id, f.round_id;


-- 2. FANTASY ------------------------------------------------------------------------------

create table profiles (
  id                uuid primary key references auth.users on delete cascade,
  username          text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name      text not null,
  favorite_club_id  integer references clubs,   -- their colors become the accent; null = neutral theme
  created_at        timestamptz not null default now()
);

create table leagues (
  id            uuid primary key default gen_random_uuid(),
  season_id     integer not null references seasons,
  mode          league_mode not null,
  format        league_format not null,
  name          text not null,
  owner_id      uuid references profiles on delete set null,  -- null for system leagues like "Genel"
  invite_code   text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  is_public     boolean not null default false,              -- "Genel" and club leagues
  color         text,                                        -- shown in the league switcher and header
  crest         text,                                        -- motif key: goz, yildiz, koc …
  starts_round  integer not null default 1,                  -- leagues can start mid-season
  settings      jsonb not null default '{}',                 -- draft: squad size, pick timer; h2h: playoffs
  created_at    timestamptz not null default now()
);

create table teams (
  id          uuid primary key default gen_random_uuid(),
  season_id   integer not null references seasons,
  owner_id    uuid not null references profiles on delete cascade,
  mode        league_mode not null,
  league_id   uuid references leagues on delete cascade,     -- draft teams belong to one league; classic teams to none
  name        text not null check (length(name) between 2 and 30),
  bank        numeric(4,1),                                  -- classic: unspent credits
  created_at  timestamptz not null default now(),
  check ((mode = 'draft') = (league_id is not null))
);
create unique index teams_one_classic_per_season on teams (owner_id, season_id) where mode = 'classic';
create unique index teams_one_per_draft_league on teams (league_id, owner_id) where mode = 'draft';

create table league_members (
  league_id  uuid not null references leagues on delete cascade,
  team_id    uuid not null references teams on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (league_id, team_id)
);
create index league_members_team on league_members (team_id);

-- A team can only join a league of its own mode and season, and a draft team only its own league.
create function check_league_member() returns trigger
language plpgsql as $$
declare
  l leagues;
  t teams;
begin
  select * into l from leagues where id = new.league_id;
  select * into t from teams where id = new.team_id;
  if l.mode <> t.mode or l.season_id <> t.season_id then
    raise exception 'Team and league must have the same mode and season';
  end if;
  if t.mode = 'draft' and t.league_id <> l.id then
    raise exception 'A draft team can only play in its own league';
  end if;
  return new;
end $$;
create trigger league_members_check before insert or update on league_members
  for each row execute function check_league_member();

-- Squad membership over time: a row per stint, closed when the player leaves.
-- The same table serves classic transfers and draft picks, free agents and trades.
create table team_players (
  id            bigint generated always as identity primary key,
  team_id       uuid not null references teams on delete cascade,
  league_id     uuid references leagues on delete cascade,   -- filled for draft teams (trigger below)
  player_id     integer not null references players,
  source        acquisition not null,
  price_paid    numeric(4,1),                                -- classic only
  joined_round  integer not null,                            -- first round he counts for
  left_round    integer,                                     -- null while he is in the squad
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  check (left_round is null or left_round >= joined_round)
);
create unique index team_players_once_in_squad on team_players (team_id, player_id) where left_at is null;
create unique index team_players_one_owner_per_draft_league on team_players (league_id, player_id)
  where left_at is null and league_id is not null;
create index team_players_current on team_players (team_id) where left_at is null;

create function set_team_player_league() returns trigger
language plpgsql as $$
begin
  new.league_id := (select league_id from teams where id = new.team_id);
  return new;
end $$;
create trigger team_players_league before insert on team_players
  for each row execute function set_team_player_league();

-- The lineup for one round. Each player's row locks at his own fixture's kickoff
-- (enforced by the save function, which arrives with the lineup screen).
create table lineups (
  team_id          uuid not null references teams on delete cascade,
  round_id         bigint not null references rounds,
  player_id        integer not null references players,
  slot             lineup_slot not null,
  bench_order      smallint check (bench_order between 1 and 4), -- auto-subs follow this order
  is_captain       boolean not null default false,
  is_vice_captain  boolean not null default false,
  primary key (team_id, round_id, player_id),
  check ((slot = 'bench') = (bench_order is not null)),
  check (not (is_captain and is_vice_captain))
);
create unique index lineups_one_captain on lineups (team_id, round_id) where is_captain;
create unique index lineups_one_vice on lineups (team_id, round_id) where is_vice_captain;
create unique index lineups_bench_order on lineups (team_id, round_id, bench_order) where bench_order is not null;

create table transfers (
  id          bigint generated always as identity primary key,
  team_id     uuid not null references teams on delete cascade,
  round_id    bigint not null references rounds,              -- the round the transfer counts for
  player_out  integer not null references players,
  player_in   integer not null references players,
  price_out   numeric(4,1) not null,
  price_in    numeric(4,1) not null,
  is_free     boolean not null,                               -- false: costs points
  made_at     timestamptz not null default now(),
  check (player_out <> player_in)
);
create index transfers_team_round on transfers (team_id, round_id);


-- 3. RESULTS ------------------------------------------------------------------------------

create table team_rounds (
  team_id         uuid not null references teams on delete cascade,
  round_id        bigint not null references rounds,
  points          numeric(6,1) not null default 0,   -- after auto-subs and captain
  transfer_cost   smallint not null default 0,       -- points taken off for extra transfers
  free_transfers  smallint,                          -- classic: available at the start of the round
  chip            text,                              -- e.g. wildcard
  bank            numeric(4,1),
  team_value      numeric(5,1),
  primary key (team_id, round_id)
);

create table matchups (
  id            bigint generated always as identity primary key,
  league_id     uuid not null references leagues on delete cascade,
  round_id      bigint not null references rounds,
  home_team_id  uuid not null references teams on delete cascade,
  away_team_id  uuid references teams on delete cascade,  -- null = bye week (odd number of teams)
  home_points   numeric(6,1),
  away_points   numeric(6,1),
  is_playoff    boolean not null default false,
  unique (league_id, round_id, home_team_id),
  check (home_team_id <> away_team_id)
);
create index matchups_round on matchups (round_id);

-- Head-to-head table: 3 points for a win, 1 for a draw. Only finished rounds count.
create view h2h_standings with (security_invoker = true) as
with results as (
  select m.league_id, m.home_team_id as team_id, m.home_points as pf, m.away_points as pa
  from matchups m join rounds r on r.id = m.round_id
  where r.status = 'finished' and not m.is_playoff and m.away_team_id is not null
  union all
  select m.league_id, m.away_team_id, m.away_points, m.home_points
  from matchups m join rounds r on r.id = m.round_id
  where r.status = 'finished' and not m.is_playoff and m.away_team_id is not null
)
select league_id, team_id,
       count(*) filter (where pf > pa)  as won,
       count(*) filter (where pf = pa)  as drawn,
       count(*) filter (where pf < pa)  as lost,
       3 * count(*) filter (where pf > pa) + count(*) filter (where pf = pa) as league_points,
       sum(pf) as points_for,
       sum(pa) as points_against
from results
group by league_id, team_id;

-- Points table for "total" leagues, counting only rounds since the league started.
create view total_standings with (security_invoker = true) as
select lm.league_id, lm.team_id,
       coalesce(sum(tr.points - tr.transfer_cost) filter (where r.number >= l.starts_round), 0) as points
from league_members lm
join leagues l on l.id = lm.league_id and l.format = 'total'
left join team_rounds tr on tr.team_id = lm.team_id
left join rounds r on r.id = tr.round_id
group by lm.league_id, lm.team_id;


-- 4. DRAFT --------------------------------------------------------------------------------

create table drafts (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null unique references leagues on delete cascade,
  status         draft_status not null default 'scheduled',
  starts_at      timestamptz,
  pick_seconds   smallint not null default 60,
  rounds         smallint not null default 15,
  pick_order     uuid[] not null default '{}',   -- team ids in round-1 order; the order reverses every round
  current_pick   integer not null default 1,
  pick_deadline  timestamptz                     -- when the current pick is made automatically
);

create table draft_picks (
  draft_id   uuid not null references drafts on delete cascade,
  pick_no    integer not null,
  team_id    uuid not null references teams on delete cascade,
  player_id  integer not null references players,
  is_auto    boolean not null default false,
  picked_at  timestamptz not null default now(),
  primary key (draft_id, pick_no),
  unique (draft_id, player_id)
);

create table draft_queues (                      -- a manager's wish list; auto-pick uses it first
  team_id    uuid not null references teams on delete cascade,
  player_id  integer not null references players,
  rank       smallint not null,
  primary key (team_id, player_id),
  unique (team_id, rank)
);


-- SECURITY --------------------------------------------------------------------------------
-- Every table has row level security. Without a policy, nothing is allowed.
--   - Football data: everyone can read; only the import job (service role) writes.
--   - Fantasy data: you can read what belongs to leagues you are in, and change only your own.
--   - Anything with game rules (joining a league, transfers, draft picks, saving a lineup after
--     kickoffs) will go through server functions that check the rules, not direct writes.

create function is_member(league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members lm join teams t on t.id = lm.team_id
    where lm.league_id = league and t.owner_id = auth.uid()
  ) or exists (select 1 from leagues where id = league and owner_id = auth.uid());
$$;

create function can_see_team(team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams where id = team and owner_id = auth.uid())
      or exists (
        select 1 from league_members theirs
        join league_members mine on mine.league_id = theirs.league_id
        join teams t on t.id = mine.team_id
        where theirs.team_id = team and t.owner_id = auth.uid()
      );
$$;

create function owns_team(team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams where id = team and owner_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['clubs', 'seasons', 'rounds', 'fixtures', 'players', 'player_seasons',
                           'player_prices', 'player_match_stats', 'profiles', 'leagues', 'teams',
                           'league_members', 'team_players', 'lineups', 'transfers', 'team_rounds',
                           'matchups', 'drafts', 'draft_picks', 'draft_queues']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['clubs', 'seasons', 'rounds', 'fixtures', 'players', 'player_seasons',
                           'player_prices', 'player_match_stats']
  loop
    execute format('create policy "anyone can read" on %I for select using (true)', t);
  end loop;
end $$;

create policy "signed-in users can read profiles" on profiles for select to authenticated using (true);
create policy "create your own profile" on profiles for insert to authenticated with check (id = auth.uid());
create policy "edit your own profile" on profiles for update to authenticated using (id = auth.uid());

create policy "see public leagues and your own" on leagues for select
  using (is_public or is_member(id));
create policy "create a league you own" on leagues for insert to authenticated
  with check (owner_id = auth.uid() and not is_public);
create policy "owner edits the league" on leagues for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and not is_public);

create policy "see teams you share a league with" on teams for select using (can_see_team(id));
create policy "create your own team" on teams for insert to authenticated with check (owner_id = auth.uid());
create policy "rename your own team" on teams for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "see members of your leagues" on league_members for select using (is_member(league_id));
create policy "see squads you can see" on team_players for select using (can_see_team(team_id));
create policy "see lineups you can see" on lineups for select using (can_see_team(team_id));
create policy "see transfers you can see" on transfers for select using (can_see_team(team_id));
create policy "see results you can see" on team_rounds for select using (can_see_team(team_id));
create policy "see matchups of your leagues" on matchups for select using (is_member(league_id));
create policy "see drafts of your leagues" on drafts for select using (is_member(league_id));
create policy "see picks of your drafts" on draft_picks for select
  using (is_member((select league_id from drafts where id = draft_id)));
create policy "manage your own wish list" on draft_queues for all to authenticated
  using (owns_team(team_id)) with check (owns_team(team_id));
